import type { NewsContext } from '../../../src/momentum2/types';
import { fetchAlpacaHeadlines } from './alpaca-news';
import { fetchEarningsCalendar } from './finnhub';

const iso = (ms: number) => new Date(ms).toISOString();

/** Haalt per kandidaat de echte koppen (laatste 3 dagen) en de earnings (komende 7 dagen). Een mislukte bron blokkeert niets. */
export async function buildNewsContext(symbol: string, nowMs = Date.now()): Promise<NewsContext> {
  const ctx: NewsContext = { headlines: [], earnings: [], sources: { alpacaNews: 'unavailable', finnhubCalendar: 'unavailable' } };
  try {
    ctx.headlines = await fetchAlpacaHeadlines(symbol, iso(nowMs - 3 * 86400000));
    ctx.sources.alpacaNews = 'ok';
  } catch {
    ctx.sources.alpacaNews = 'error';
  }
  try {
    const ev = await fetchEarningsCalendar(iso(nowMs).slice(0, 10), iso(nowMs + 7 * 86400000).slice(0, 10));
    if (ev) { ctx.earnings = ev; ctx.sources.finnhubCalendar = 'ok'; }
  } catch {
    ctx.sources.finnhubCalendar = 'error';
  }
  return ctx;
}
