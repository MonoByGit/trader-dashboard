import { alpaca } from '@/lib/alpaca';
import type { DailyBar } from '@backtest/types';

function toDailyBar(b: { t: string; o: number; h: number; l: number; c: number; v: number }): DailyBar {
  return { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v };
}

export async function fetchCryptoDailyBars(
  symbols: string[],
  start: string,
  end: string,
  timeframe: '1Day' | '1Hour' = '1Day',
): Promise<Record<string, DailyBar[]>> {
  const data = await alpaca.cryptoBarsRange(symbols, start, end, timeframe);
  const out: Record<string, DailyBar[]> = {};
  for (const sym of symbols) {
    out[sym] = (data.bars?.[sym] ?? []).map(toDailyBar);
  }
  return out;
}

/** UTC calendar days between start/end inclusive. */
export function cryptoTradingDates(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${start}T00:00:00Z`);
  const endD = new Date(`${end}T00:00:00Z`);
  while (cur <= endD) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}
