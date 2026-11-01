import type { DailyBar } from '@backtest/types';

function toDailyBar(b: { t: string; o: number; h: number; l: number; c: number; v: number }): DailyBar {
  return { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v };
}

/** Calendar days between start/end (crypto trades 24/7). */
export function calendarDaysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  const endMs = new Date(`${end}T00:00:00Z`).getTime();
  while (d.getTime() <= endMs) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export async function fetchCryptoDailyBars(
  symbols: string[],
  start: string,
  end: string,
): Promise<Record<string, DailyBar[]>> {
  const uniq = Array.from(new Set(symbols));
  const url = new URL('https://data.alpaca.markets/v1beta3/crypto/us/bars');
  url.searchParams.set('symbols', uniq.join(','));
  url.searchParams.set('timeframe', '1Day');
  url.searchParams.set('start', start);
  url.searchParams.set('end', end);
  url.searchParams.set('limit', '10000');

  const res = await fetch(url.toString(), {
    headers: {
      'APCA-API-KEY-ID': process.env.ALPACA_API_KEY!,
      'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY!,
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Alpaca crypto bars: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as {
    bars?: Record<string, Array<{ t: string; o: number; h: number; l: number; c: number; v: number }>>;
  };
  const out: Record<string, DailyBar[]> = {};
  for (const sym of uniq) {
    const key = sym.replace('/', '');
    out[sym] = (data.bars?.[sym] ?? data.bars?.[key] ?? []).map(toDailyBar);
  }
  return out;
}

/** Optional hourly bars for crypto backtests. */
export async function fetchCryptoHourlyBars(
  symbols: string[],
  start: string,
  end: string,
): Promise<Record<string, DailyBar[]>> {
  const uniq = Array.from(new Set(symbols));
  const url = new URL('https://data.alpaca.markets/v1beta3/crypto/us/bars');
  url.searchParams.set('symbols', uniq.join(','));
  url.searchParams.set('timeframe', '1Hour');
  url.searchParams.set('start', start);
  url.searchParams.set('end', end);
  url.searchParams.set('limit', '10000');

  const res = await fetch(url.toString(), {
    headers: {
      'APCA-API-KEY-ID': process.env.ALPACA_API_KEY!,
      'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY!,
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Alpaca crypto hourly: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as {
    bars?: Record<string, Array<{ t: string; o: number; h: number; l: number; c: number; v: number }>>;
  };
  const out: Record<string, DailyBar[]> = {};
  for (const sym of uniq) {
    const key = sym.replace('/', '');
    out[sym] = (data.bars?.[sym] ?? data.bars?.[key] ?? []).map(toDailyBar);
  }
  return out;
}
