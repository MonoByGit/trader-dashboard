#!/usr/bin/env npx tsx
/**
 * Walk-forward backtest Momentum 3 per versie: crypto tegen BTC, ETF tegen SPY, kosten inbegrepen.
 * Usage: npx tsx scripts/run-momentum3.ts --start=2022-01-01 --end=2026-10-30 [--train=365 --test=90]
 * Vereist ALPACA_API_KEY en ALPACA_SECRET_KEY (alleen marktdata, geen orders).
 */
import { m3Versions } from '../src/momentum3/config.js';
import { walkForward } from '../src/momentum3/walkforward.js';
import type { Bar } from '../src/momentum2/types.js';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const headers = () => {
  const key = process.env.ALPACA_API_KEY, secret = process.env.ALPACA_SECRET_KEY;
  if (!key || !secret) throw new Error('Zet ALPACA_API_KEY en ALPACA_SECRET_KEY');
  return { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret };
};

async function fetchBars(kind: 'stocks' | 'crypto', symbols: string[], start: string, end: string): Promise<Record<string, Bar[]>> {
  const out: Record<string, Bar[]> = Object.fromEntries(symbols.map((s) => [s, []]));
  let token: string | undefined;
  do {
    const u = new URL(kind === 'crypto' ? 'https://data.alpaca.markets/v1beta3/crypto/us/bars' : 'https://data.alpaca.markets/v2/stocks/bars');
    u.searchParams.set('symbols', symbols.join(','));
    u.searchParams.set('timeframe', '1Day');
    u.searchParams.set('start', start);
    u.searchParams.set('end', end);
    u.searchParams.set('limit', '10000');
    if (kind === 'stocks') { u.searchParams.set('adjustment', 'split'); u.searchParams.set('feed', process.env.ALPACA_DATA_FEED ?? 'iex'); }
    if (token) u.searchParams.set('page_token', token);
    const res = await fetch(u, { headers: headers() });
    if (!res.ok) throw new Error(await res.text());
    const d = (await res.json()) as { bars?: Record<string, Bar[]>; next_page_token?: string };
    for (const s of symbols) out[s]!.push(...(d.bars?.[s] ?? []));
    token = d.next_page_token;
  } while (token);
  return out;
}

async function main() {
  const end = arg('end') ?? new Date().toISOString().slice(0, 10);
  const start = arg('start') ?? '2022-01-01';
  const trainDays = Number(arg('train') ?? 365), testDays = Number(arg('test') ?? 90);
  const warm = new Date(new Date(start).getTime() - 330 * 86400000).toISOString().slice(0, 10);
  const [crypto, etf] = m3Versions();
  const grid = (c: typeof crypto) => [25, 30, 35].flatMap((r) => [c!.hardStopPct - 0.01, c!.hardStopPct, c!.hardStopPct + 0.01].map((h) => ({ rsiTrigger: c!.kind === 'etf' ? r + 10 : r, hardStopPct: h })));

  const cb = await fetchBars('crypto', [...crypto!.universe], warm, end);
  const eb = await fetchBars('stocks', Array.from(new Set(['SPY', ...etf!.universe])), warm, end);
  const runs = [
    { cfg: crypto!, data: { barsBySymbol: cb, benchmark: cb['BTC/USD']! }, bench: 'BTC' },
    { cfg: etf!, data: { barsBySymbol: eb, benchmark: eb.SPY! }, bench: 'SPY' },
  ];
  for (const r of runs) {
    const w = await walkForward({ cfg: r.cfg, data: r.data, grid: grid(r.cfg), trainDays, testDays });
    console.log(`\n${r.cfg.id}: out-of-sample ${w.oosReturnPct.toFixed(1)}% | ${r.bench} ${w.oosBenchmarkPct.toFixed(1)}% | verschil ${w.oosExcessPct.toFixed(1)} pp | ${w.windows.length} vensters`);
    for (const x of w.windows) {
      console.log(`  ${x.testStart}..${x.testEnd}  ${JSON.stringify(x.chosen)}  test ${x.testReturnPct.toFixed(1)}% vs ${x.testBenchmarkPct.toFixed(1)}%  maxDD ${x.testMaxDrawdownPct.toFixed(1)}%  trades ${x.testTrades}`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
