import { equityOf } from '../momentum2/book';
import { sizingBase } from '../momentum2/risk';
import { dateOf } from '../momentum2/indicators';
import type { StrategyHooks } from '../momentum2/hooks';
import type { Bar, OrderIntent, VersionBook } from '../momentum2/types';
import type { M3Config } from './config';
import { m3StopLevel } from './risk';
import { currentRsi, entryCandidates } from './signals';

const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export function planM3(input: {
  barsBySymbol: Record<string, Bar[]>;
  book: VersionBook;
  cfg: M3Config;
  calendarDates?: string[];
}): { orders: OrderIntent[] } {
  const { barsBySymbol, book, cfg, calendarDates } = input;
  const orders: OrderIntent[] = [];
  const today = cfg.universe.map((s) => barsBySymbol[s]?.at(-1)).find(Boolean);
  const todayStr = today ? dateOf(today) : '';

  if (book.halted) {
    for (const [symbol, p] of Object.entries(book.positions)) {
      orders.push({ symbol, side: 'sell', qty: p.qty, reason: `versie dicht: ${book.haltReason ?? 'verliesgrens'}` });
    }
    return { orders };
  }

  const held = new Set(Object.keys(book.positions));
  for (const [symbol, p] of Object.entries(book.positions)) {
    const bars = barsBySymbol[symbol];
    const rsi = currentRsi(bars);
    const holdDays = todayStr ? dayDiff(p.entryDate, todayStr) : 0;
    const trailLive =
      p.highWater >= p.entryPrice * (1 + cfg.trailActivatePct) ||
      m3StopLevel(p, cfg, bars).kind === 'trailing';
    if (holdDays >= cfg.minHoldDays && rsi !== null && rsi >= cfg.exitRsi && !trailLive) {
      orders.push({ symbol, side: 'sell', qty: p.qty, reason: `RSI ${rsi.toFixed(0)} hersteld` });
      held.delete(symbol);
    } else if (todayStr && holdDays >= cfg.maxHoldDays) {
      orders.push({ symbol, side: 'sell', qty: p.qty, reason: `${cfg.maxHoldDays} dagen vast` });
      held.delete(symbol);
    }
  }

  const prices: Record<string, number> = {};
  for (const s of cfg.universe) {
    const b = barsBySymbol[s]?.at(-1);
    if (b) prices[s] = b.c;
  }
  const slots = cfg.topN - held.size;
  if (slots > 0) {
    const base = sizingBase(equityOf(book, prices), book, cfg);
    const cooled = (sym: string) => {
      const last = book.lastExit?.[sym];
      return !!last && !!todayStr && dayDiff(last, todayStr) < cfg.cooldownDays;
    };
    for (const c of entryCandidates(barsBySymbol, cfg, calendarDates)
      .filter((e) => !held.has(e.symbol) && !cooled(e.symbol))
      .slice(0, slots)) {
      orders.push({
        symbol: c.symbol,
        side: 'buy',
        notionalUsd: base * cfg.positionPct,
        reason: `RSI-dip ${c.rsi.toFixed(0)} en draai`,
      });
    }
  }
  orders.sort((a, b) => (a.side === b.side ? 0 : a.side === 'sell' ? -1 : 1));
  return { orders };
}

export const m3Hooks: StrategyHooks<M3Config> = {
  stopFor: (pos, cfg, bars) => m3StopLevel(pos, cfg, bars),
  plan: async (i) => {
    const dates = Object.values(i.barsBySymbol)
      .flatMap((b) => b.map(dateOf))
      .sort();
    const calendarDates = dates.length ? Array.from(new Set(dates)) : undefined;
    return { ...planM3({ ...i, calendarDates }), vetoes: [] };
  },
};
