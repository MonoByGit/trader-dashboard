import { fetchCryptoBars } from '@/lib/alpaca-bars';
import { toTradingDateString } from '../../src/dates/trading-date';
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
  const startYmd = toTradingDateString(start);
  const endYmd = toTradingDateString(end);
  const raw = await fetchCryptoBars({ symbols, start: startYmd, end: endYmd, timeframe });
  const out: Record<string, DailyBar[]> = {};
  for (const sym of symbols) {
    out[sym] = (raw[sym] ?? []).map(toDailyBar);
  }
  return out;
}

/** UTC calendar days between start/end inclusive. */
export function cryptoTradingDates(start: string, end: string): string[] {
  const startYmd = toTradingDateString(start);
  const endYmd = toTradingDateString(end);
  const out: string[] = [];
  const cur = new Date(`${startYmd}T00:00:00Z`);
  const endD = new Date(`${endYmd}T00:00:00Z`);
  while (cur <= endD) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}
