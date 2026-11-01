import { equityOf } from '../momentum2/book';
import { sizingBase } from '../momentum2/risk';
import type { StrategyHooks } from '../momentum2/hooks';
import type { Bar, OrderIntent, VersionBook } from '../momentum2/types';
import type { M5Config } from './config';
import { M5_AWAIT_FRESH_UP, m5StopLevel } from './risk';
import { bandTarget, freshUpSignal } from './signals';

function desiredHold(book: VersionBook, cfg: M5Config, qqqBars: Bar[]): 'risk' | 'cash' {
  const bt = bandTarget(qqqBars, cfg);
  const awaitUp = book.strategyState?.[M5_AWAIT_FRESH_UP] === true;
  if (awaitUp) {
    if (freshUpSignal(qqqBars, cfg)) {
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

  const hold = desiredHold(book, cfg, qqqSeries);
  const targetSym = hold === 'risk' ? cfg.riskSymbol : cfg.cashSymbol;
  const prices: Record<string, number> = {};
  for (const s of [cfg.riskSymbol, cfg.cashSymbol, cfg.signalSymbol]) {
    const b = barsBySymbol[s]?.at(-1);
    if (b) prices[s] = b.c;
  }
  const notional = sizingBase(equityOf(book, prices), book, cfg);

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

  if (!book.positions[targetSym] && notional > 0 && book.cash > 1) {
    orders.push({
      symbol: targetSym,
      side: 'buy',
      notionalUsd: Math.min(notional, book.cash),
      reason: hold === 'risk' ? 'QQQ boven band / fresh up' : 'QQQ onder band / wacht op up',
    });
  }

  orders.sort((a, b) => (a.side === b.side ? 0 : a.side === 'sell' ? -1 : 1));
  return { orders };
}

export const m5Hooks: StrategyHooks<M5Config> = {
  stopFor: (pos, cfg, _bars, symbol) => m5StopLevel(pos, cfg, symbol ?? cfg.riskSymbol),
  plan: async (i) => ({ ...planM5(i), vetoes: [] }),
};
