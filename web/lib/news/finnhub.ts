import type { EarningsEvent } from '../../../src/momentum2/types';

let cache: { key: string; at: number; events: EarningsEvent[] } | null = null;

/** Earningskalender via de gratis Finnhub-API. Zonder FINNHUB_API_KEY: null (bron onbeschikbaar). Sleutel gaat in een header, nooit in de URL. */
export async function fetchEarningsCalendar(from: string, to: string): Promise<EarningsEvent[] | null> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) return null;
  const k = `${from}|${to}`;
  if (cache && cache.key === k && Date.now() - cache.at < 10 * 60_000) return cache.events;
  const u = new URL('https://finnhub.io/api/v1/calendar/earnings');
  u.searchParams.set('from', from);
  u.searchParams.set('to', to);
  const res = await fetch(u, { headers: { 'X-Finnhub-Token': token }, signal: AbortSignal.timeout(10_000), cache: 'no-store' });
  if (!res.ok) throw new Error(`Finnhub ${res.status}`);
  const d = (await res.json()) as { earningsCalendar?: Array<{ symbol?: string; date?: string }> };
  const events = (d.earningsCalendar ?? []).filter((e) => e.symbol && e.date).map((e) => ({ symbol: String(e.symbol), date: String(e.date) }));
  cache = { key: k, at: Date.now(), events };
  return events;
}
