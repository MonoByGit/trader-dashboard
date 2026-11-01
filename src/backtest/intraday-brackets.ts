import type { DailyBar } from './types';
import { barTradingDate } from './indicators';

export function hourlyBarsForTradingDate(bars: DailyBar[], dateYmd: string): DailyBar[] {
  return bars
    .filter((b) => barTradingDate(b) === dateYmd)
    .sort((a, b) => a.t.localeCompare(b.t));
}

export type BracketHit = 'stop' | 'take_profit' | null;

/** Walk intraday bars in order; stop before take-profit if both would hit. */
export function firstBracketHit(
  stop: number,
  takeProfit: number,
  intraday: DailyBar[],
): { hit: BracketHit; price: number } | null {
  for (const bar of intraday) {
    if (bar.l <= stop) return { hit: 'stop', price: stop };
    if (bar.h >= takeProfit) return { hit: 'take_profit', price: takeProfit };
  }
  return null;
}

/** Aggregate hourly OHLCV to one daily bar per calendar date (for signals). */
export function aggregateHourlyToDaily(hourly: DailyBar[]): DailyBar[] {
  const byDate = new Map<string, DailyBar[]>();
  for (const b of hourly) {
    const d = barTradingDate(b);
    const list = byDate.get(d) ?? [];
    list.push(b);
    byDate.set(d, list);
  }
  const out: DailyBar[] = [];
  for (const [date, bars] of Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    bars.sort((a, b) => a.t.localeCompare(b.t));
    const o = bars[0]!.o;
    const c = bars[bars.length - 1]!.c;
    let h = -Infinity;
    let l = Infinity;
    let v = 0;
    for (const b of bars) {
      h = Math.max(h, b.h);
      l = Math.min(l, b.l);
      v += b.v;
    }
    out.push({ t: date, o, h, l, c, v });
  }
  return out;
}
