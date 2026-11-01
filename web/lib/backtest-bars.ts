import { alpaca } from '@/lib/alpaca';
import { aggregateHourlyToDaily } from '@backtest/intraday-brackets';
import { fetchStockDailyBars } from '@/lib/alpaca-bars';
import { toTradingDateString } from '../../src/dates/trading-date';
import type { DailyBar } from '@backtest/types';

function toDailyBar(b: { t: string; o: number; h: number; l: number; c: number; v: number }): DailyBar {
  return { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v };
}

async function fetchAlpacaBars(
  symbols: string[],
  timeframe: '1Day' | '1Hour',
  start: string,
  end: string,
): Promise<Record<string, DailyBar[]>> {
  const startYmd = toTradingDateString(start);
  const endYmd = toTradingDateString(end);
  const uniq = Array.from(new Set(symbols));
  const raw = await fetchStockDailyBars({
    symbols: uniq,
    timeframe,
    start: startYmd,
    end: endYmd,
    adjustment: 'split',
  });
  const out: Record<string, DailyBar[]> = {};
  for (const sym of uniq) {
    out[sym] = (raw[sym] ?? []).map(toDailyBar);
  }
  return out;
}

/** Fetch daily bars for symbols between start/end (inclusive, YYYY-MM-DD). */
export async function fetchHistoricalDailyBars(
  symbols: string[],
  start: string,
  end: string,
): Promise<Record<string, DailyBar[]>> {
  return fetchAlpacaBars(symbols, '1Day', start, end);
}

/** Fetch hourly bars (Alpaca 1Hour) for intraday bracket simulation. */
export async function fetchHistoricalHourlyBars(
  symbols: string[],
  start: string,
  end: string,
): Promise<Record<string, DailyBar[]>> {
  return fetchAlpacaBars(symbols, '1Hour', start, end);
}

/** Daily bars derived from hourly when barMode is hourly. */
export function dailyBarsFromHourly(hourlyBySymbol: Record<string, DailyBar[]>): Record<string, DailyBar[]> {
  const out: Record<string, DailyBar[]> = {};
  for (const [sym, bars] of Object.entries(hourlyBySymbol)) {
    out[sym] = aggregateHourlyToDaily(bars);
  }
  return out;
}

export async function fetchTradingDates(start: string, end: string): Promise<string[]> {
  const startYmd = toTradingDateString(start);
  const endYmd = toTradingDateString(end);
  const days = await alpaca.calendar(startYmd, endYmd);
  return days.map((d) => d.date).sort();
}
