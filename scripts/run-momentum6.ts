#!/usr/bin/env npx tsx
/**
 * Walk-forward backtest Momentum 6 (btc-breakout) vs BTC.
 * Usage: npx tsx scripts/run-momentum6.ts --start=2021-01-01 --end=2026-11-01 [--test=90]
 * Vereist ALPACA_API_KEY en ALPACA_SECRET_KEY (marktdata).
 */
import { dateOf } from '../src/momentum2/indicators.js';
import { walkForwardCarry } from '../src/momentum2/walkforward-carry.js';
import { m6Config } from '../src/momentum6/config.js';
import { m6Hooks } from '../src/momentum6/plan.js';
import type { Bar } from '../src/momentum2/types.js';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const headers = () => {
  const key = process.env.ALPACA_API_KEY, secret = process.env.ALPACA_SECRET_KEY;
  if (!key || !secret) throw new Error('Zet ALPACA_API_KEY en ALPACA_SECRET_KEY');
  return { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret };
};

async function fetchCrypto(symbols: string[], start: string, end: string): Promise<Record<string, Bar[]>> {
  const out: Record<string, Bar[]> = Object.fromEntries(symbols.map((s) => [s, []]));
  let token: string | undefined;
  do {
    const u = new URL('https://data.alpaca.markets/v1beta3/crypto/us/bars');
    u.searchParams.set('symbols', symbols.join(','));
    u.searchParams.set('timeframe', '1Day');
    u.searchParams.set('start', start);
    u.searchParams.set('end', end);
    u.searchParams.set('limit', '10000');
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
  const end = arg('end') ?? '2026-11-01';
  const start = arg('start') ?? '2021-01-01';
  const testDays = Number(arg('test') ?? 90);
  const warm = new Date(new Date(start).getTime() - 40 * 86400000).toISOString().slice(0, 10);
  const cfg = m6Config();
  const cb = await fetchCrypto(['BTC/USD'], warm, end);
  const btc = cb['BTC/USD'] ?? [];
  console.log(`BTC bars: ${btc.length} (${btc[0] ? dateOf(btc[0]) : '?'} .. ${btc.at(-1) ? dateOf(btc.at(-1)!) : '?'})`);

  const w = await walkForwardCarry({
    cfg,
    data: { barsBySymbol: cb, benchmark: btc },
    hooks: m6Hooks,
    testDays,
    fillGaps: true,
    periodsPerYear: 365,
  });
  console.log(`\n=== ${cfg.id} vs BTC ===`);
  const haltNote = w.haltedOn ? `, sleeve gehalt op ${w.haltedOn} (blijft gehalt)` : '';
  console.log(`OOS ${w.oosPeriodStart} .. ${w.oosPeriodEnd} (${w.windows.length} vensters${haltNote})`);
  console.log(
    `Return ${w.oosReturnPct.toFixed(1)}% | BTC ${w.oosBenchmarkPct.toFixed(1)}% | excess ${w.oosExcessPct.toFixed(1)} pp | MaxDD ${w.oosMaxDrawdownPct.toFixed(1)}% | Sharpe ${w.oosSharpe.toFixed(2)} | trades ${w.oosTradeCount} | costs ~${w.oosCostsPctOfBudget.toFixed(1)}% budget`,
  );
}
main().catch((e) => { console.error(e); process.exit(1); });
