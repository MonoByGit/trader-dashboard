#!/usr/bin/env npx tsx
/**
 * Walk-forward backtest M4 (13F) — drie varianten, out-of-sample.
 *
 * Usage:
 *   npx tsx scripts/run-momentum4.ts --from=2020-01-01 --to=2025-06-30 \
 *     --bars-cache=/path/bars.json --snapshots-cache=/path/snaps.json
 *
 * Marktdata (kies één):
 *   ALPACA_API_KEY + ALPACA_SECRET_KEY  → live Alpaca daily bars
 *   --bars-cache=./bars.json            → JSON Record<symbol, Bar[]>
 *
 * 13F: SEC EDGAR (User-Agent studio@monobydusty.com). Snapshots optioneel cachen:
 *   --snapshots-cache=./snaps.json      → HoldingsSnapshot[][]
 *
 * Opties: --max-names=10 --basket-weight=conviction|equal --variant=all|berkshire|basket|new-only
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dedupe13FByReport, fetch13FHoldings, list13FFilings } from '../src/momentum4/edgar.js';
import type { HoldingsSnapshot } from '../src/momentum4/holdings.js';
import { M4_BASKET_LOW_TURNOVER, M4_BERKSHIRE } from '../src/momentum4/funds.js';
import { m4Version, type M4Variant } from '../src/momentum4/config.js';
import { buildM4Signals } from '../src/momentum4/signals-build.js';
import type { BasketWeightMode } from '../src/momentum4/basket.js';
import { walkForwardM4 } from '../src/momentum4/walkforward.js';
import type { BacktestSummary } from '../src/momentum4/backtest-metrics.js';
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
    const raw = JSON.parse(readFileSync(cachePath, 'utf8')) as HoldingsSnapshot[][];
    const need = new Set(ciks);
    return raw.filter((chain) => chain[0] && need.has(chain[0].cik));
  }
  const cache = new Map<string, string>();
  const cusip = cusipDisk();
  const { openFigiResolver } = await import('../src/momentum4/edgar.js');
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
        process.stderr.write(`\nSkip ${cik} ${f.accessionNumber}: ${e}\n`);
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
    for (const s of symbols) out[s] = (all[s] ?? []).filter((b) => b.t >= start && b.t <= end);
    return out;
  }
  const alpaca = await fetchAlpaca(symbols, start, end);
  if (alpaca.SPY?.length) return alpaca;
  return {};
}

function printTable(label: string, o: BacktestSummary, windows: number) {
  console.log(`\n### ${label}\n`);
  console.log('| Meting | Strategie | SPY |');
  console.log('| --- | ---: | ---: |');
  console.log(`| Rendement % | ${o.returnPct.toFixed(1)} | ${o.spyReturnPct.toFixed(1)} |`);
  console.log(`| Max drawdown % | ${o.maxDrawdownPct.toFixed(1)} | ${o.spyMaxDrawdownPct.toFixed(1)} |`);
  console.log(`| Sharpe | ${o.sharpe.toFixed(2)} | — |`);
  console.log(`| Trades | ${o.trades} | — |`);
  console.log(`| Geschatte kosten USD | ${o.costUsd.toFixed(0)} | — |`);
  console.log(`| Periode OOS | ${o.periodStart} → ${o.periodEnd} (${windows} vensters) | |`);
}

async function runVariant(input: {
  label: string;
  chains: HoldingsSnapshot[][];
  variant: M4Variant;
  maxNames: number;
  basketWeight: BasketWeightMode;
  bars: Record<string, Bar[]>;
}) {
  const tradingDates = input.bars.SPY!.map((b) => b.t.slice(0, 10));
  const signals = buildM4Signals({
    chains: input.chains,
    variant: input.variant,
    maxNames: input.maxNames,
    basketWeight: input.basketWeight,
    tradingDates,
  });
  const symbols = Array.from(new Set(['SPY', ...Object.values(signals).flat().map((s) => s.symbol)]));
  const cfg = m4Version(100_000, symbols.filter((s) => s !== 'SPY'), {
    variant: input.variant,
    maxNames: input.maxNames,
    basketWeight: input.basketWeight,
    topN: input.maxNames,
    positionPct: input.variant === 'basket' ? 1 : 0.1,
  });
  const wf = await walkForwardM4({
    cfg,
    data: { benchmark: input.bars.SPY!, barsBySymbol: { ...input.bars, SPY: input.bars.SPY! } },
    signalsByDate: signals,
    grid:
      input.variant === 'basket'
        ? [{ maxNames: input.maxNames, basketWeight: input.basketWeight }]
        : [
            { minAddPct: 5, positionPct: 0.08 },
            { minAddPct: 10, positionPct: 0.1 },
            { minAddPct: 15, positionPct: 0.1 },
          ],
    trainDays: 504,
    testDays: 252,
    slippageBps: 2,
  });
  printTable(input.label, wf.oos, wf.windows.length);
  return wf.oos;
}

async function main() {
  const from = arg('from') ?? '2020-01-01';
  const to = arg('to') ?? '2025-06-30';
  const maxNames = Number(arg('max-names') ?? '10');
  const basketWeight = (arg('basket-weight') ?? 'conviction') as BasketWeightMode;
  const variantArg = arg('variant') ?? 'all';

  const basketCiks = M4_BASKET_LOW_TURNOVER.map((f) => f.cik);
  const allChains = await loadSnapshots(basketCiks, from, to, arg('snapshots-cache'));
  if (!allChains.length) throw new Error('Geen 13F-ketens; minstens 2 filings per fonds nodig');

  const berkshireChain = allChains.filter((c) => c[0]?.cik === M4_BERKSHIRE.cik);
  if (!berkshireChain.length) throw new Error('Geen Berkshire-keten in snapshots');

  const symbols = Array.from(
    new Set(['SPY', ...allChains.flatMap((c) => c.flatMap((s) => s.holdings.map((h) => h.symbol)))]),
  );
  const bars = await fetchBars(symbols, from, to, arg('bars-cache'));
  if (!bars.SPY?.length) {
    console.error(`
Geen Alpaca-bars op deze VM (ALPACA_API_KEY/ALPACA_SECRET_KEY ontbreken) en geen --bars-cache.

Exact commando om lokaal te draaien (zelfde periode als PR):

  export ALPACA_API_KEY=... ALPACA_SECRET_KEY=...
  npx tsx scripts/run-momentum4.ts --from=${from} --to=${to} \\
    --snapshots-cache=/tmp/m4-snaps.json

Eerste run vult snapshots-cache via EDGAR (~15–30 min). Daarna bars opnieuw:

  npx tsx scripts/run-momentum4.ts --from=${from} --to=${to} \\
    --snapshots-cache=/tmp/m4-snaps.json --bars-cache=/tmp/m4-bars.json

Of alles in één keer zonder caches als Alpaca-keys gezet zijn.
`);
    process.exit(2);
  }

  console.log(`\n# M4 walk-forward OOS (${from} → ${to})`);
  console.log('\n**Low-turnover mandje (CIK + waarom):**\n');
  for (const f of M4_BASKET_LOW_TURNOVER) {
    console.log(`- ${f.label} (\`${f.cik}\`): ${f.rationale}`);
  }

  const run = async (name: string, v: M4Variant, chains: HoldingsSnapshot[][]) => {
    if (variantArg !== 'all' && variantArg !== name) return;
    await runVariant({
      label:
        v === 'diff'
          ? '(a) Berkshire alleen — 13F diff-copy'
          : v === 'basket'
            ? `(b) Mandje ${M4_BASKET_LOW_TURNOVER.length} fondsen — top ${maxNames} ${basketWeight}`
            : '(c) Alleen nieuwe posities (open) — mandje diff',
      chains,
      variant: v,
      maxNames,
      basketWeight,
      bars,
    });
  };

  await run('berkshire', 'diff', berkshireChain);
  await run('basket', 'basket', allChains);
  await run('new-only', 'new-only', allChains);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
