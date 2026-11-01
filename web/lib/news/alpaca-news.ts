import type { NewsHeadline } from '../../../src/momentum2/types';

/** Echte koppen per symbool via Alpaca News (zelfde sleutels als marktdata, geen extra kosten bekend). */
export async function fetchAlpacaHeadlines(symbol: string, sinceIso: string, limit = 8): Promise<NewsHeadline[]> {
  const key = process.env.ALPACA_API_KEY, secret = process.env.ALPACA_SECRET_KEY;
  if (!key || !secret) throw new Error('Alpaca-sleutels ontbreken');
  const u = new URL('https://data.alpaca.markets/v1beta1/news');
  u.searchParams.set('symbols', symbol.replace('/', ''));
  u.searchParams.set('start', sinceIso);
  u.searchParams.set('limit', String(limit));
  u.searchParams.set('sort', 'desc');
  const res = await fetch(u, { headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret }, signal: AbortSignal.timeout(10_000), cache: 'no-store' });
  if (!res.ok) throw new Error(`Alpaca News ${res.status}`);
  const d = (await res.json()) as { news?: Array<{ headline?: string; source?: string; created_at?: string; url?: string }> };
  return (d.news ?? []).filter((n) => n.headline).map((n) => ({
    headline: String(n.headline), source: n.source ?? 'onbekend', publishedAt: n.created_at ?? '', url: n.url,
  }));
}
