#!/usr/bin/env npx tsx
/**
 * Backtest van Momentum 2 (ETF-rotatie), alle standaardversies naast elkaar, versus SPY.
 * Usage: npx tsx scripts/run-momentum2.ts --start=2023-01-02 --end=2026-10-30
 * Vereist ALPACA_API_KEY en ALPACA_SECRET_KEY (alleen marktdata, geen orders).
 */
import { DEFAULT_VERSIONS } from '../src/momentum2/config.js';
import { simulateVersions } from '../src/momentum2/simulate.js';
import type { Bar } from '../src/momentum2/types.js';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];

async function fetchBars(symbols: string[], start: string, end: string): Promise<Record<string, Bar[]>> {
  const key = process.env.ALPACA_API_KEY, secret = process.env.ALPACA_SECRET_KEY;
  if (!key || !secret) throw new Error('Zet ALPACA_API_KEY en ALPACA_SECRET_KEY');
  const out: Record<string, Bar[]> = Object.fromEntries(symbols.map((s) => [s, []]));
  let token: string | undefined;
  do {
    const u = new URL('https://data.alpaca.markets/v2/stocks/bars');
    u.searchParams.set('symbols', symbols.join(','));
    u.searchParams.set('timeframe', '1Day');
    u.searchParams.set('start', start);
    u.searchParams.set('end', end);
    u.searchParams.set('limit', '10000');
    u.searchParams.set('adjustment', 'split');
    u.searchParams.set('feed', process.env.ALPACA_DATA_FEED ?? 'iex');
    if (token) u.searchParams.set('page_token', token);
    const res = await fetch(u, { headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret } });
    if (!res.ok) throw new Error(await res.text());
    const d = (await res.json()) as { bars?: Record<string, Bar[]>; next_page_token?: string };
    for (const s of symbols) out[s]!.push(...(d.bars?.[s] ?? []));
    token = d.next_page_token;
  } while (token);
  return out;
}

async function main() {
  const end = arg('end') ?? new Date().toISOString().slice(0, 10);
  const start = arg('start') ?? '2023-01-02';
  const warm = new Date(new Date(start).getTime() - 330 * 86400000).toISOString().slice(0, 10); // 200 handelsdagen opwarmen
  const symbols = Array.from(new Set(['SPY', ...DEFAULT_VERSIONS.flatMap((v) => v.universe)]));
  const bars = await fetchBars(symbols, warm, end);
  const results = await simulateVersions(DEFAULT_VERSIONS, { barsBySymbol: bars, benchmark: bars.SPY! });
  for (const r of results) {
    const m = r.metrics;
    console.log(
      `${r.versionId}: ${m.totalReturnPct.toFixed(1)}% | SPY ${m.spyReturnPct.toFixed(1)}% | verschil ${m.excessVsSpyPct.toFixed(1)} pp | ` +
        `maxDD ${m.maxDrawdownPct.toFixed(1)}% | trades ${m.tradeCount}${m.halted ? ' | DICHT' : ''}`,
    );
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
