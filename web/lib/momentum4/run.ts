import { fetchStockDailyBars } from '../alpaca-bars';
import { dbQuery, dbRun } from '../db';
import { tradingDateEt } from '@scheduler/decide';
import { decideDay, executeDay } from '../../../src/momentum2/live';
import { resolveShadowMode } from '../../../src/momentum2/mode';
import type { Bar } from '../../../src/momentum2/types';
import { M4_13F_FUNDS } from '../../../src/momentum4/funds';
import {
  dedupe13FByReport,
  fetch13FHoldings,
  list13FFilings,
  openFigiResolver,
  type EdgarFetchOptions,
} from '../../../src/momentum4/edgar';
import { diffHoldings, type HoldingsSnapshot } from '../../../src/momentum4/holdings';
import { m4Version } from '../../../src/momentum4/config';
import { makeM4Hooks } from '../../../src/momentum4/plan';
import { shadowBroker } from '../momentum2/broker';
import { postgresStore } from '../momentum2/store';

let ready: Promise<void> | null = null;
const ensure = () =>
  (ready ??= dbRun(`CREATE TABLE IF NOT EXISTS momentum4_snapshots (
  cik TEXT NOT NULL, as_of DATE NOT NULL, filed_at DATE NOT NULL, snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (cik, as_of))`));

const cusipCache = new Map<string, string | null>();

async function latestTwo(cik: string): Promise<HoldingsSnapshot[]> {
  await ensure();
  const rows = await dbQuery<{ snapshot: HoldingsSnapshot }>(
    `SELECT snapshot FROM momentum4_snapshots WHERE cik = $1 ORDER BY filed_at DESC LIMIT 2`,
    [cik],
  );
  return rows.map((r) => r.snapshot).reverse();
}

async function refreshFund(cik: string, opt: EdgarFetchOptions): Promise<HoldingsSnapshot | null> {
  const filings = dedupe13FByReport(await list13FFilings(cik, opt));
  const latest = filings.at(-1);
  if (!latest) return null;
  const resolver = openFigiResolver(cusipCache, opt);
  const snap = await fetch13FHoldings(cik, latest, resolver, opt);
  await ensure();
  await dbRun(
    `INSERT INTO momentum4_snapshots (cik, as_of, filed_at, snapshot) VALUES ($1,$2,$3,$4)
     ON CONFLICT (cik, as_of) DO UPDATE SET filed_at = $3, snapshot = $4`,
    [cik, snap.asOf, snap.filedAt, JSON.stringify(snap)],
  );
  return snap;
}

/** Alleen schaduw. 13F via SEC EDGAR (fair access User-Agent); geen echte orders. */
export async function runMomentum4(
  step: 'refresh' | 'decide' | 'execute',
  body: { cik?: string } = {},
  nowMs = Date.now(),
): Promise<Record<string, unknown>> {
  const mode = resolveShadowMode(process.env, 'MOMENTUM4');
  if (!mode.run) return { skipped: true, reason: mode.reason };
  const today = tradingDateEt(nowMs);
  const edgarOpt: EdgarFetchOptions = { cache: new Map() };

  if (step === 'refresh') {
    const targets = body.cik ? M4_13F_FUNDS.filter((f) => f.cik === body.cik) : M4_13F_FUNDS;
    const updated = [];
    for (const f of targets) {
      const snap = await refreshFund(f.cik, edgarOpt);
      if (snap) updated.push({ cik: f.cik, label: f.label, asOf: snap.asOf, filedAt: snap.filedAt, holdings: snap.holdings.length });
    }
    return { step, updated };
  }

  const signalsByDate: Record<string, ReturnType<typeof diffHoldings>> = {};
  for (const f of M4_13F_FUNDS) {
    const [prev, next] = await latestTwo(f.cik);
    if (prev && next) signalsByDate[next.filedAt] = [...(signalsByDate[next.filedAt] ?? []), ...diffHoldings(prev, next)];
  }
  const allSignals = Object.values(signalsByDate).flat();
  const symbols = Array.from(new Set(['SPY', ...allSignals.map((s) => s.symbol)]));
  const cfg = m4Version(undefined, symbols.filter((s) => s !== 'SPY'));
  const store = postgresStore();
  const raw = await fetchStockDailyBars({ symbols, lookbackCalendarDays: 40, adjustment: 'split' });
  const bars: Record<string, Bar[]> = {};
  for (const [s, b] of Object.entries(raw)) if (b.length) bars[s] = b.map((x) => ({ t: x.t, o: x.o, h: x.h, l: x.l, c: x.c, v: x.v }));

  if (step === 'decide') {
    const spy = bars.SPY ?? [];
    if (spy.at(-1)?.t.slice(0, 10) !== today) return { skipped: true, reason: 'geen slotbar voor vandaag' };
    const hooks = makeM4Hooks((d) => signalsByDate[d] ?? []);
    const { planned } = await decideDay({ date: today, cfgs: [cfg], hooks, barsBySymbol: bars, benchmark: spy, store });
    return { step, shadow: true, date: today, signals: allSignals.length, planned };
  }

  const hooks = makeM4Hooks((d) => signalsByDate[d] ?? []);
  const { trades } = await executeDay({
    date: today,
    cfgs: [cfg],
    hooks,
    lastPrice: Object.fromEntries(Object.entries(bars).map(([s, b]) => [s, b.at(-1)!.c])),
    broker: shadowBroker(Object.fromEntries(Object.entries(bars).map(([s, b]) => [s, b.at(-1)!.c]))),
    store,
  });
  return { step, shadow: true, date: today, trades: trades.length };
}
