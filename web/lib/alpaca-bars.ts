import type { AlpacaBar } from './alpaca-types';
import { fetchCryptoBars as fetchCryptoBarsImpl } from '../../src/alpaca/fetch-crypto-bars';
import { alpacaStockDailyEndExclusiveUtc } from '../../src/alpaca/stock-bars-range';
import { tradingDateEt } from '@scheduler/decide';

export const DEFAULT_DAILY_BAR_LOOKBACK_DAYS = 120;

export { cryptoBarsSymbolsQueryString } from '../../src/alpaca/crypto-bars-query';

export function alpacaDataFeed(): string {
  return process.env.ALPACA_DATA_FEED ?? 'iex';
}

function alpacaDataHeaders(): Record<string, string> {
  return {
    'APCA-API-KEY-ID': process.env.ALPACA_API_KEY!,
    'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY!,
  };
}

function addCalendarDaysYmd(ymd: string, deltaDays: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export function defaultBarDateRange(lookbackCalendarDays = DEFAULT_DAILY_BAR_LOOKBACK_DAYS): {
  start: string;
  end: string;
} {
  const endEt = tradingDateEt(Date.now());
  const end = alpacaStockDailyEndExclusiveUtc(endEt);
  const start = addCalendarDaysYmd(endEt, -lookbackCalendarDays);
  return { start, end };
}

export interface FetchDailyBarsOptions {
  symbols: string[];
  timeframe?: string;
  start?: string;
  end?: string;
  /** Trim each symbol to the last N bars after fetch. */
  limit?: number;
  lookbackCalendarDays?: number;
  adjustment?: 'raw' | 'split' | 'dividend' | 'all';
}

/** Paginated Alpaca v2 stock bars (IEX/SIP feed from env). */
export async function fetchStockDailyBars(
  opts: FetchDailyBarsOptions,
): Promise<Record<string, AlpacaBar[]>> {
  const timeframe = opts.timeframe ?? '1Day';
  const range =
    opts.start && opts.end
      ? { start: opts.start, end: opts.end }
      : defaultBarDateRange(opts.lookbackCalendarDays);

  const url = new URL('https://data.alpaca.markets/v2/stocks/bars');
  url.searchParams.set('symbols', opts.symbols.join(','));
  url.searchParams.set('timeframe', timeframe);
  url.searchParams.set('start', range.start);
  url.searchParams.set('end', range.end);
  url.searchParams.set('limit', '10000');
  url.searchParams.set('feed', alpacaDataFeed());
  if (opts.adjustment) url.searchParams.set('adjustment', opts.adjustment);

  const merged: Record<string, AlpacaBar[]> = {};
  for (const sym of opts.symbols) merged[sym] = [];

  let pageToken: string | undefined;
  for (;;) {
    const pageUrl = new URL(url.toString());
    if (pageToken) pageUrl.searchParams.set('page_token', pageToken);
    else pageUrl.searchParams.delete('page_token');

    const res = await fetch(pageUrl.toString(), {
      headers: alpacaDataHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Alpaca bars: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as {
      bars?: Record<string, AlpacaBar[]>;
      next_page_token?: string;
    };
    for (const sym of opts.symbols) {
      const chunk = data.bars?.[sym] ?? [];
      merged[sym]!.push(...chunk);
    }
    pageToken = data.next_page_token;
    if (!pageToken) break;
  }

  if (opts.limit != null && opts.limit > 0) {
    for (const sym of opts.symbols) {
      const arr = merged[sym]!;
      if (arr.length > opts.limit) merged[sym] = arr.slice(-opts.limit);
    }
  }

  return merged;
}

export type { FetchCryptoBarsOptions } from '../../src/alpaca/fetch-crypto-bars';

/** Re-export; implementation lives in src/alpaca/fetch-crypto-bars.ts. */
export const fetchCryptoBars = fetchCryptoBarsImpl;
