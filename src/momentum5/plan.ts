import { equityOf } from '../momentum2/book';
import { sizingBase } from '../momentum2/risk';
import type { StrategyHooks } from '../momentum2/hooks';
import type { Bar, OrderIntent, VersionBook } from '../momentum2/types';
import type { M5Config } from './config';
import { M5_AWAIT_FRESH_UP, m5StopLevel } from './risk';
import { exitCloseDisasterFromPeak } from './signals-close';
import { armFreshUpAfterStop, bandTarget, freshUpSignal } from './signals';

function desiredHold(book: VersionBook, cfg: M5Config, qqqBars: Bar[]): 'risk' | 'cash' {
  const bt = bandTarget(qqqBars, cfg);
  const awaitUp = book.strategyState?.[M5_AWAIT_FRESH_UP] === true;
  if (awaitUp) {
    if (freshUpSignal(qqqBars, cfg, book)) {
      book.strategyState = { ...book.strategyState, [M5_AWAIT_FRESH_UP]: false };
      return 'risk';
    }
    return 'cash';
  }
  if (bt === 'risk') return 'risk';
  if (bt === 'cash') return 'cash';
  if (book.positions[cfg.riskSymbol]) return 'risk';
  if (book.positions[cfg.cashSymbol]) return 'cash';
  return 'cash';
}

export function planM5(input: {
  barsBySymbol: Record<string, Bar[]>;
  book: VersionBook;
  cfg: M5Config;
}): { orders: OrderIntent[] } {
  const { barsBySymbol, book, cfg } = input;
  const orders: OrderIntent[] = [];
  const qqqSeries = barsBySymbol[cfg.signalSymbol] ?? [];
  if (qqqSeries.length < cfg.smaDays) return { orders };

  if (book.halted) {
    for (const [symbol, p] of Object.entries(book.positions)) {
      orders.push({ symbol, side: 'sell', qty: p.qty, reason: `versie dicht: ${book.haltReason ?? 'verliesgrens'}` });
    }
    return { orders };
  }

  const riskBars = barsBySymbol[cfg.riskSymbol] ?? [];
  const riskPos = book.positions[cfg.riskSymbol];
  if (
    riskPos &&
    riskBars.length > 0 &&
    exitCloseDisasterFromPeak(riskBars, cfg.closeDisasterStopPct, riskPos.entryDate)
  ) {
    orders.push({
      symbol: cfg.riskSymbol,
      side: 'sell',
      qty: riskPos.qty,
      reason: `${(cfg.closeDisasterStopPct * 100).toFixed(0)}% close disaster`,
    });
    armFreshUpAfterStop(book);
    orders.sort((a, b) => (a.side === b.side ? 0 : a.side === 'sell' ? -1 : 1));
    return { orders };
  }

  const hold = desiredHold(book, cfg, qqqSeries);
  const targetSym = hold === 'risk' ? cfg.riskSymbol : cfg.cashSymbol;
  const prices: Record<string, number> = {};
  for (const s of [cfg.riskSymbol, cfg.cashSymbol, cfg.signalSymbol]) {
    const b = barsBySymbol[s]?.at(-1);
    if (b) prices[s] = b.c;
  }

  for (const [sym, p] of Object.entries({ ...book.positions })) {
    if (sym !== targetSym) {
      orders.push({
        symbol: sym,
        side: 'sell',
        qty: p.qty,
        reason: sym === cfg.riskSymbol ? 'regime naar cash' : 'regime naar risico',
      });
    }
  }

  let deployable = book.cash;
  for (const [sym, p] of Object.entries(book.positions)) {
    if (sym !== targetSym) deployable += p.qty * (prices[sym] ?? p.entryPrice);
  }

  const eq = equityOf(book, prices);
  const targetNotional = sizingBase(eq, book, cfg);
  const currentExp = book.positions[targetSym]
    ? book.positions[targetSym]!.qty * (prices[targetSym] ?? book.positions[targetSym]!.entryPrice)
    : 0;
  const gap = targetNotional - currentExp;
  const minDeploy = targetNotional * 0.95 - currentExp;

  if (gap > 1 && deployable > 1 && minDeploy > 0) {
    orders.push({
      symbol: targetSym,
      side: 'buy',
      notionalUsd: Math.min(gap, deployable),
      reason: hold === 'risk' ? 'QQQ boven band / fresh up' : 'QQQ onder band / wacht op up',
    });
  }

  orders.sort((a, b) => (a.side === b.side ? 0 : a.side === 'sell' ? -1 : 1));
  return { orders };
}

/** Na rebalance op de open: sleeve minstens `minPct` in het doel-ETF. */
export function m5RiskExposurePct(book: VersionBook, cfg: M5Config, prices: Record<string, number>): number {
  const eq = equityOf(book, prices);
  if (eq <= 0) return 0;
  const p = book.positions[cfg.riskSymbol];
  if (!p) return 0;
  return (p.qty * (prices[cfg.riskSymbol] ?? p.entryPrice)) / eq;
}

export const m5Hooks: StrategyHooks<M5Config> = {
  stopFor: (pos, cfg, bars, symbol) => m5StopLevel(pos, cfg, symbol ?? cfg.riskSymbol, bars),
  plan: async (i) => ({ ...planM5(i), vetoes: [] }),
  onStopFilled: ({ book, cfg, symbol }) => {
    if (symbol === cfg.riskSymbol) armFreshUpAfterStop(book);
  },
};
