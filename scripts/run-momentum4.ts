#!/usr/bin/env npx tsx
/**
 * Walk-forward backtest M4 (13F copy) vs SPY, out-of-sample only.
 * Usage: npx tsx scripts/run-momentum4.ts [--from=2019-01-01] [--to=2025-12-31] [--cik=1067983]
 *   [--bars-cache=./bars.json] [--snapshots-cache=./snaps.json]
 * Marktdata: ALPACA_API_KEY + ALPACA_SECRET_KEY (voorkeur). Geen keys → bars-cache verplicht.
 * 13F: SEC EDGAR (User-Agent studio@monobydusty.com). CUSIP→ticker: OpenFIGI cache in /tmp/m4-cusip-cache.json
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dedupe13FByReport, fetch13FHoldings, list13FFilings, openFigiResolver, type Filing13F } from '../src/momentum4/edgar.js';
import { mergeFundSignals, type HoldingsSnapshot } from '../src/momentum4/holdings.js';
import { M4_13F_FUNDS } from '../src/momentum4/funds.js';
import { m4Version } from '../src/momentum4/config.js';
import { walkForwardM4 } from '../src/momentum4/walkforward.js';
import type { Bar } from '../src/momentum2/types.js';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];

const CACHE = '/tmp/m4-cusip-cache.json';
const cusipDisk = (): Map<string, string | null> => {
  const m = new Map<string, string | null>();
  if (existsSync(CACHE)) {
    for (const [k, v] of Object.entries(JSON.parse(readFileSync(CACHE, 'utf8')) as Record<string, string | null>)) {
      m.set(k, v);
    }
  }
  return m;
};
const saveCusip = (m: Map<string, string | null>) => writeFileSync(CACHE, JSON.stringify(Object.fromEntries(m)));

async function loadSnapshots(ciks: string[], from: string, to: string, cachePath?: string): Promise<HoldingsSnapshot[][]> {
  if (cachePath && existsSync(cachePath)) {
    return JSON.parse(readFileSync(cachePath, 'utf8')) as HoldingsSnapshot[][];
  }
  const cache = new Map<string, string>();
  const cusip = cusipDisk();
  const resolver = openFigiResolver(cusip, { cache, minIntervalMs: 150 });
  const chains: HoldingsSnapshot[][] = [];
  for (const cik of ciks) {
    const filings = dedupe13FByReport(await list13FFilings(cik, { cache, minIntervalMs: 150 })).filter(
      (f) => f.filingDate >= from && f.filingDate <= to,
    );
    const snaps: HoldingsSnapshot[] = [];
    for (const f of filings) {
      try {
        snaps.push(await fetch13FHoldings(cik, f, resolver, { cache, minIntervalMs: 150 }));
        process.stderr.write(`.`);
      } catch (e) {
        process.stderr.write(`\nSkip ${f.accessionNumber}: ${e}\n`);
      }
    }
    saveCusip(cusip);
    if (snaps.length >= 2) chains.push(snaps.sort((a, b) => a.filedAt.localeCompare(b.filedAt)));
  }
  process.stderr.write('\n');
  if (cachePath) writeFileSync(cachePath, JSON.stringify(chains));
  return chains;
}

async function fetchAlpaca(symbols: string[], start: string, end: string): Promise<Record<string, Bar[]>> {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY;
  if (!key || !secret) return {};
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

async function fetchBars(symbols: string[], start: string, end: string, cachePath?: string): Promise<Record<string, Bar[]>> {
  if (cachePath && existsSync(cachePath)) {
    const all = JSON.parse(readFileSync(cachePath, 'utf8')) as Record<string, Bar[]>;
    const out: Record<string, Bar[]> = {};
    for (const s of symbols) {
      out[s] = (all[s] ?? []).filter((b) => b.t >= start && b.t <= end);
    }
    return out;
  }
  const alpaca = await fetchAlpaca(symbols, start, end);
  if (alpaca.SPY?.length) return alpaca;
  throw new Error('Geen marktdata: zet ALPACA_API_KEY/SECRET of geef --bars-cache=...');
}

async function main() {
  const from = arg('from') ?? '2019-01-01';
  const to = arg('to') ?? '2025-12-31';
  const cikArg = arg('cik');
  const ciks = cikArg ? [cikArg] : M4_13F_FUNDS.map((f) => f.cik);
  const chains = await loadSnapshots(ciks, from, to, arg('snapshots-cache'));
  if (!chains.length) throw new Error('Geen 13F-keten (minstens 2 filings per fonds)');
  const signals = mergeFundSignals(chains);
  const symbols = Array.from(new Set(['SPY', ...Object.values(signals).flat().map((s) => s.symbol)]));
  const bars = await fetchBars(symbols, from, to, arg('bars-cache'));
  if (!bars.SPY?.length) throw new Error('Geen SPY-koersdata');
  const cfg = m4Version(100_000, symbols.filter((s) => s !== 'SPY'));
  const wf = await walkForwardM4({
    cfg,
    data: { benchmark: bars.SPY, barsBySymbol: bars },
    signalsByDate: signals,
    grid: [
      { minAddPct: 5, positionPct: 0.08 },
      { minAddPct: 10, positionPct: 0.1 },
      { minAddPct: 15, positionPct: 0.1 },
    ],
    trainDays: 504,
    testDays: 252,
    slippageBps: 2,
  });
  const o = wf.oos;
  console.log('\n## M4 walk-forward (out-of-sample)\n');
  console.log('| Meting | M4 | SPY |');
  console.log('| --- | ---: | ---: |');
  console.log(`| Rendement % | ${o.returnPct.toFixed(1)} | ${o.spyReturnPct.toFixed(1)} |`);
  console.log(`| Max drawdown % | ${o.maxDrawdownPct.toFixed(1)} | — |`);
  console.log(`| Sharpe | ${o.sharpe.toFixed(2)} | — |`);
  console.log(`| Trades | ${o.trades} | — |`);
  console.log(`| Win rate % | ${o.winRatePct.toFixed(1)} | — |`);
  console.log(`| Geschatte kosten USD | ${o.costUsd.toFixed(0)} | — |`);
  console.log(`| Periode | ${o.periodStart} → ${o.periodEnd} | |`);
  console.log(`| Vensters | ${wf.windows.length} | |`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
