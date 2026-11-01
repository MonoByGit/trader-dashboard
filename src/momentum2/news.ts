import type { EarningsEvent, NewsContext } from './types';

const MAX_HEADLINES = 8;

/** Bronnenregels voor de besluitenlog, bijv. ['alpaca-news:ok(5)', 'finnhub-calendar:unavailable']. */
export function sourceLabels(ctx: NewsContext): string[] {
  return [
    `alpaca-news:${ctx.sources.alpacaNews}${ctx.sources.alpacaNews === 'ok' ? `(${ctx.headlines.length})` : ''}`,
    `finnhub-calendar:${ctx.sources.finnhubCalendar}${ctx.sources.finnhubCalendar === 'ok' ? `(${ctx.earnings.length})` : ''}`,
  ];
}

/** Leesbaar blok voor in de prompt. Zonder bronnen staat er expliciet dat het model niets weet. */
export function formatNewsContext(ctx: NewsContext | undefined, symbol: string): string {
  if (!ctx) return 'Er is geen nieuws aangeleverd. Je kent het nieuws van vandaag niet; veto niet op basis van geheugen.';
  const lines: string[] = [];
  if (ctx.sources.alpacaNews === 'ok') {
    if (ctx.headlines.length === 0) lines.push(`Nieuws (Alpaca): geen koppen voor ${symbol} in de afgelopen dagen.`);
    else {
      lines.push('Koppen (Alpaca News):');
      for (const h of ctx.headlines.slice(0, MAX_HEADLINES)) lines.push(`- [${h.publishedAt.slice(0, 10)}] ${h.headline} (${h.source})`);
    }
  } else lines.push(`Nieuws (Alpaca): niet beschikbaar (${ctx.sources.alpacaNews}). Je kent het nieuws niet.`);
  if (ctx.sources.finnhubCalendar === 'ok') {
    const mine = ctx.earnings.filter((e) => e.symbol === symbol);
    lines.push(mine.length ? `Earnings (Finnhub): ${mine.map((e) => e.date).join(', ')}.` : `Earnings (Finnhub): geen datum voor ${symbol} in de komende dagen.`);
  } else lines.push(`Earningskalender (Finnhub): niet beschikbaar (${ctx.sources.finnhubCalendar}).`);
  return lines.join('\n');
}

export function earningsWithin(events: EarningsEvent[], symbol: string, fromDate: string, days: number): boolean {
  const end = new Date(Date.parse(fromDate) + days * 86400000).toISOString().slice(0, 10);
  return events.some((e) => e.symbol === symbol && e.date >= fromDate && e.date <= end);
}
