import type { AlpacaBar } from './alpaca';
import { setCryptoBarsSymbols } from '../../src/alpaca/crypto-bars-query';
import { toTradingDateString } from '../../src/dates/trading-date';
import { tradingDateEt } from '@scheduler/decide';

const DATA = 'https://data.alpaca.markets';

export const DEFAULT_DAILY_BAR_LOOKBACK_DAYS = 120;

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
  const end = tradingDateEt(Date.now());
  const start = addCalendarDaysYmd(end, -lookbackCalendarDays);
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

export interface FetchCryptoBarsOptions {
  symbols: string[];
  timeframe?: string;
  start?: string;
  end?: string;
  limit?: number;
  lookbackCalendarDays?: number;
}

/** Paginated Alpaca crypto bars (explicit start/end or lookback window). */
export async function fetchCryptoBars(
  opts: FetchCryptoBarsOptions,
): Promise<Record<string, AlpacaBar[]>> {
  const timeframe = opts.timeframe ?? '1Day';
  const range =
    opts.start && opts.end
      ? { start: toTradingDateString(opts.start), end: toTradingDateString(opts.end) }
      : defaultBarDateRange(opts.lookbackCalendarDays);

  const url = new URL(`${DATA}/v1beta3/crypto/us/bars`);
  setCryptoBarsSymbols(url, opts.symbols);
  url.searchParams.set('timeframe', timeframe);
  url.searchParams.set('start', range.start);
  url.searchParams.set('end', range.end);
  url.searchParams.set('limit', '10000');

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
    if (!res.ok) throw new Error(`Alpaca crypto bars: ${res.status} ${await res.text()}`);
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
