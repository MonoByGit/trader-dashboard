import { alpaca } from '@/lib/alpaca';
import { aggregateHourlyToDaily } from '@backtest/intraday-brackets';
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
  const uniq = Array.from(new Set(symbols));
  const url = new URL('https://data.alpaca.markets/v2/stocks/bars');
  url.searchParams.set('symbols', uniq.join(','));
  url.searchParams.set('timeframe', timeframe);
  url.searchParams.set('start', start);
  url.searchParams.set('end', end);
  url.searchParams.set('limit', '10000');
  url.searchParams.set('feed', 'iex');
  url.searchParams.set('adjustment', 'split');

  const res = await fetch(url.toString(), {
    headers: {
      'APCA-API-KEY-ID': process.env.ALPACA_API_KEY!,
      'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY!,
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Alpaca bars: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as {
    bars?: Record<string, Array<{ t: string; o: number; h: number; l: number; c: number; v: number }>>;
  };
  const out: Record<string, DailyBar[]> = {};
  for (const sym of uniq) {
    out[sym] = (data.bars?.[sym] ?? []).map(toDailyBar);
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
  const days = await alpaca.calendar(start, end);
  return days.map((d) => d.date).sort();
}
