import { toTradingDateString } from '../dates/trading-date';
import { tradingDateEt } from '../scheduler/decide';
import { buildCryptoBarsListUrl } from './crypto-bars-query';

export interface AlpacaBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  vw: number;
}

export const DEFAULT_CRYPTO_BAR_LOOKBACK_DAYS = 120;

function addCalendarDaysYmd(ymd: string, deltaDays: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export function defaultCryptoBarDateRange(
  lookbackCalendarDays = DEFAULT_CRYPTO_BAR_LOOKBACK_DAYS,
): { start: string; end: string } {
  const end = tradingDateEt(Date.now());
  const start = addCalendarDaysYmd(end, -lookbackCalendarDays);
  return { start, end };
}

export interface FetchCryptoBarsOptions {
  symbols: string[];
  timeframe?: string;
  start?: string;
  end?: string;
  limit?: number;
  lookbackCalendarDays?: number;
}

function alpacaDataHeaders(): Record<string, string> {
  return {
    'APCA-API-KEY-ID': process.env.ALPACA_API_KEY!,
    'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY!,
  };
}

/** Paginated Alpaca crypto bars (explicit start/end or lookback window). */
export async function fetchCryptoBars(
  opts: FetchCryptoBarsOptions,
): Promise<Record<string, AlpacaBar[]>> {
  const timeframe = opts.timeframe ?? '1Day';
  const range =
    opts.start && opts.end
      ? { start: toTradingDateString(opts.start), end: toTradingDateString(opts.end) }
      : defaultCryptoBarDateRange(opts.lookbackCalendarDays);

  const url = buildCryptoBarsListUrl({
    symbols: opts.symbols,
    start: range.start,
    end: range.end,
    timeframe,
  });

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
