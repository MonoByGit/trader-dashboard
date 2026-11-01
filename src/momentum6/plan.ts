import { equityOf } from '../momentum2/book';
import { sizingBase } from '../momentum2/risk';
import { dateOf } from '../momentum2/indicators';
import type { StrategyHooks } from '../momentum2/hooks';
import type { Bar, OrderIntent, VersionBook } from '../momentum2/types';
import type { M6Config } from './config';
import { m6StopLevel } from './risk';
import { exitCloseDisasterFromPeak } from '../momentum5/signals-close';
import { breakoutEntry, dayDiff, exitBelowLow, exitTrailFromPeakClose } from './signals';

const sym = (cfg: M6Config) => cfg.universe[0]!;

export function planM6(input: {
  barsBySymbol: Record<string, Bar[]>;
  book: VersionBook;
  cfg: M6Config;
}): { orders: OrderIntent[] } {
  const { barsBySymbol, book, cfg } = input;
  const orders: OrderIntent[] = [];
  const symbol = sym(cfg);
  const bars = barsBySymbol[symbol] ?? [];
  const todayBar = bars.at(-1);
  const todayStr = todayBar ? dateOf(todayBar) : '';

  if (book.halted) {
    for (const [s, p] of Object.entries(book.positions)) {
      orders.push({ symbol: s, side: 'sell', qty: p.qty, reason: `versie dicht: ${book.haltReason ?? 'verliesgrens'}` });
    }
    return { orders };
  }

  const pos = book.positions[symbol];
  if (pos && todayStr) {
    const signalDate = pos.signalDate ?? pos.entryDate;
    const holdDays = dayDiff(signalDate, todayStr);
    if (exitCloseDisasterFromPeak(bars, cfg.hardStopPct, signalDate)) {
      orders.push({ symbol, side: 'sell', qty: pos.qty, reason: `${(cfg.hardStopPct * 100).toFixed(0)}% close disaster` });
    } else if (holdDays >= cfg.maxHoldDays) {
      orders.push({ symbol, side: 'sell', qty: pos.qty, reason: `${cfg.maxHoldDays} dagen vast` });
    } else if (exitBelowLow(bars, cfg)) {
      orders.push({ symbol, side: 'sell', qty: pos.qty, reason: 'onder 10d low' });
    } else if (exitTrailFromPeakClose(bars, cfg, signalDate)) {
      orders.push({ symbol, side: 'sell', qty: pos.qty, reason: '12% trail vanaf peak close' });
    }
  } else if (!pos && bars.length >= cfg.smaDays && breakoutEntry(bars, cfg)) {
    const prices: Record<string, number> = { [symbol]: todayBar!.c };
    const notional = sizingBase(equityOf(book, prices), book, cfg);
    if (notional > 0 && book.cash > 1) {
      orders.push({
        symbol,
        side: 'buy',
        notionalUsd: Math.min(notional, book.cash),
        reason: '20d breakout',
        signalDate: todayStr,
      });
    }
  }

  orders.sort((a, b) => (a.side === b.side ? 0 : a.side === 'sell' ? -1 : 1));
  return { orders };
}

export const m6Hooks: StrategyHooks<M6Config> = {
  stopFor: (pos, cfg) => m6StopLevel(pos, cfg),
  plan: async (i) => ({ ...planM6(i), vetoes: [] }),
};
