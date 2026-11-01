#!/usr/bin/env npx tsx
/**
 * Walk-forward backtest Momentum 5 (nasdaq-trend) vs QQQ en SPY.
 * Usage: npx tsx scripts/run-momentum5.ts --start=2018-01-01 --end=2026-10-30 [--test=90] [--trail=0.30]
 * Vereist ALPACA_API_KEY en ALPACA_SECRET_KEY (marktdata).
 */
import { dateOf } from '../src/momentum2/indicators.js';
import { walkForwardCarry } from '../src/momentum2/walkforward-carry.js';
import { m5Versions } from '../src/momentum5/config.js';
import { m5Hooks } from '../src/momentum5/plan.js';
import type { Bar } from '../src/momentum2/types.js';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const headers = () => {
  const key = process.env.ALPACA_API_KEY, secret = process.env.ALPACA_SECRET_KEY;
  if (!key || !secret) throw new Error('Zet ALPACA_API_KEY en ALPACA_SECRET_KEY');
  return { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret };
};

async function fetchStocks(symbols: string[], start: string, end: string): Promise<Record<string, Bar[]>> {
  const out: Record<string, Bar[]> = Object.fromEntries(symbols.map((s) => [s, []]));
  let token: string | undefined;
  do {
    const u = new URL('https://data.alpaca.markets/v2/stocks/bars');
    u.searchParams.set('symbols', symbols.join(','));
    u.searchParams.set('timeframe', '1Day');
    u.searchParams.set('start', start);
    u.searchParams.set('end', end);
    u.searchParams.set('limit', '10000');
    u.searchParams.set('adjustment', process.env.ALPACA_STOCK_ADJUSTMENT ?? 'all');
    u.searchParams.set('feed', process.env.ALPACA_DATA_FEED ?? 'sip');
    if (token) u.searchParams.set('page_token', token);
    const res = await fetch(u, { headers: headers() });
    if (!res.ok) throw new Error(await res.text());
    const d = (await res.json()) as { bars?: Record<string, Bar[]>; next_page_token?: string };
    for (const s of symbols) out[s]!.push(...(d.bars?.[s] ?? []));
    token = d.next_page_token;
  } while (token);
  return out;
}

function print(label: string, w: Awaited<ReturnType<typeof walkForwardCarry>>, bench: string) {
  console.log(`\n=== ${label} vs ${bench} ===`);
  const haltNote = w.haltedOn ? `, sleeve gehalt op ${w.haltedOn} (blijft gehalt)` : '';
  console.log(`OOS ${w.oosPeriodStart} .. ${w.oosPeriodEnd} (${w.windows.length} vensters${haltNote})`);
  console.log(
    `Return ${w.oosReturnPct.toFixed(1)}% | ${bench} ${w.oosBenchmarkPct.toFixed(1)}% | excess ${w.oosExcessPct.toFixed(1)} pp | MaxDD ${w.oosMaxDrawdownPct.toFixed(1)}% | Sharpe ${w.oosSharpe.toFixed(2)} | trades ${w.oosTradeCount}`,
  );
}

async function main() {
  const end = arg('end') ?? '2026-10-30';
  const start = arg('start') ?? '2018-01-01';
  const testDays = Number(arg('test') ?? 90);
  const warm = new Date(new Date(start).getTime() - 330 * 86400000).toISOString().slice(0, 10);
  const trailArg = arg('trail');
  const closeDisaster = trailArg != null && trailArg !== '' ? Number(trailArg) : undefined;
  const versions = m5Versions(100_000, {
    includeTqqq: process.env.MOMENTUM5_TQQQ === '1',
    closeDisasterStopPct: Number.isFinite(closeDisaster!) ? closeDisaster : undefined,
  });

  for (const cfg of versions) {
    const syms = ['QQQ', 'QLD', 'TQQQ', 'BIL', 'SPY'];
    const bars = await fetchStocks(syms, warm, end);
    const qqq = bars.QQQ ?? [];
    console.log(`QQQ bars: ${qqq.length} (${qqq[0] ? dateOf(qqq[0]) : '?'} .. ${qqq.at(-1) ? dateOf(qqq.at(-1)!) : '?'})`);

    const data = {
      barsBySymbol: { QQQ: qqq, QLD: bars.QLD!, BIL: bars.BIL!, ...(cfg.riskSymbol === 'TQQQ' ? { TQQQ: bars.TQQQ! } : {}) },
      benchmark: qqq,
    };
    const wQ = await walkForwardCarry({ cfg, data, hooks: m5Hooks, testDays });
    print(cfg.id, wQ, 'QQQ');

    const dataSpy = { ...data, benchmark: bars.SPY! };
    const wS = await walkForwardCarry({ cfg, data: dataSpy, hooks: m5Hooks, testDays });
    print(cfg.id, wS, 'SPY');
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
