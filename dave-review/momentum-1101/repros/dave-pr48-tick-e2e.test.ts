/** @jest-environment node */
// Dave repro PR 48 (f936264): echte runMomentumTick + echte runMomentum2/3/5/6 + echte routine_runs/settings in pglite (TIMESTAMPTZ komt als Date terug).
// Alpaca en fetch zijn verklikkers: elke order-methode of niet-GET naar Alpaca wordt vastgelegd en faalt.
import { jest } from '@jest/globals';

let pg: { query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[]; affectedRows?: number }>; exec: (s: string) => Promise<unknown> };
const q = async (s: string, p: unknown[] = []) => { const r = await pg.query(s, p); return { rows: r.rows as Record<string, unknown>[], rowCount: r.affectedRows ?? r.rows.length }; };
const orderCalls: string[] = [];
const readCalls: string[] = [];
const netCalls: string[] = [];
const logs: string[] = [];

const ALLOWED = new Set(['clock', 'latestQuotes', 'calendar']);
const alpacaSpy = new Proxy({}, {
  get: (_t, k: string) => async (...a: unknown[]) => {
    if (!ALLOWED.has(k)) { orderCalls.push(`alpaca.${k}`); throw new Error(`verboden Alpaca-aanroep ${k}`); }
    readCalls.push(k);
    if (k === 'clock') return { is_open: true, timestamp: new Date().toISOString() };
    if (k === 'latestQuotes') { const syms = a[0] as string[]; return { quotes: Object.fromEntries(syms.map((s) => [s, { ap: 101, bp: 100 }])) }; }
    return [];
  },
});

function days(): string[] {
  const out: string[] = []; const d = new Date('2026-05-01T00:00:00Z');
  while (d.toISOString().slice(0, 10) <= '2026-11-03') { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
const ALL = days();
function bars(sym: string, crypto: boolean) {
  const ds = crypto ? ALL : ALL.filter((x) => ![0, 6].includes(new Date(`${x}T12:00:00Z`).getUTCDay()));
  const seed = [...sym].reduce((a, c) => a + c.charCodeAt(0), 0) % 7;
  return ds.map((x, i) => { const c = 50 + i * (0.2 + seed * 0.05); return { t: `${x}T${crypto ? '00:00:00' : '04:00:00'}Z`, o: c, h: c * 1.01, l: c * 0.99, c, v: 1e6, n: 1, vw: c }; });
}
let fakeNow = 0; // Alpaca geeft geen bars uit de toekomst: dagbar van vandaag pas na de slot (21:00 UTC in november)
const visible = (t: string, crypto: boolean) => crypto ? Date.parse(t) <= fakeNow : Date.parse(`${t.slice(0, 10)}T21:00:00Z`) <= fakeNow;
const realFetch = global.fetch;
global.fetch = (async (input: unknown, init?: { method?: string }) => {
  const url = String(input instanceof URL ? input.toString() : (input as { url?: string }).url ?? input);
  const method = (init?.method ?? 'GET').toUpperCase();
  netCalls.push(`${method} ${url.split('?')[0]}`);
  if (/alpaca\.markets/.test(url) && method !== 'GET') { orderCalls.push(`${method} ${url}`); throw new Error('verboden schrijf-aanroep naar Alpaca'); }
  if (/data\.alpaca\.markets\/v\d\w*\/(stocks|crypto)/.test(url)) {
    const u = new URL(url); const crypto = /crypto/.test(url);
    const syms = (u.searchParams.get('symbols') ?? '').split(',').filter(Boolean);
    return new Response(JSON.stringify({ bars: Object.fromEntries(syms.map((s) => [s, bars(s, crypto).filter((b) => visible(b.t, crypto))])), next_page_token: null }), { status: 200 });
  }
  if (/deepseek/.test(url)) return new Response(JSON.stringify({ choices: [{ message: { content: '{"veto":false,"reason":"ok"}' } }] }), { status: 200 });
  orderCalls.push(`onbekend ${method} ${url}`);
  throw new Error(`onverwachte fetch ${url}`);
}) as typeof fetch;

beforeAll(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  pg = new PGlite() as unknown as typeof pg;
  await pg.exec(`CREATE TABLE routine_runs (id TEXT PRIMARY KEY, routine TEXT, trading_date DATE, started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ, status TEXT, skip_reason TEXT, error_message TEXT, duration_ms INT, asset_class TEXT);
    CREATE TABLE routine_run_locks (routine TEXT NOT NULL, slot_key TEXT NOT NULL, run_id TEXT NOT NULL, acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (routine, slot_key));
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMPTZ DEFAULT NOW());`);
});
afterAll(() => { global.fetch = realFetch; });

await jest.unstable_mockModule('@/lib/db', () => ({
  hasDb: () => true,
  dbQuery: async (s: string, p?: unknown[]) => (await q(s, p ?? [])).rows,
  dbRun: async (s: string, p?: unknown[]) => { await q(s, p ?? []); },
  initDb: async () => {},
  dbTransaction: async (fn: (query: typeof q) => Promise<unknown>) => { await pg.query('BEGIN'); try { const r = await fn(q); await pg.query('COMMIT'); return r; } catch (e) { await pg.query('ROLLBACK'); throw e; } },
}));
await jest.unstable_mockModule('@/lib/migrate', () => ({ ensureSchema: async () => {} }));
await jest.unstable_mockModule('@/lib/alpaca', () => ({ alpaca: alpacaSpy }));
await jest.unstable_mockModule('@/lib/guards/service', () => ({ loadGuardState: async () => ({ emergencyStop: false, tradingEnabled: true, circuitBreakerTripped: false }) }));

const { runMomentumTick } = await import('@/lib/momentum-tick');
const cal = (date: string) => ({ date, open: '09:30', close: '16:00' });
const tick = (iso: string, d: string) => (fakeNow = Date.parse(iso), runMomentumTick(Date.parse(iso), cal(d), { log: (l) => logs.push(l) }));

const ENV = ['MOMENTUM2', 'MOMENTUM3', 'MOMENTUM4', 'MOMENTUM5', 'MOMENTUM6'];
function setEnv(en: Record<string, string | undefined>) {
  for (const n of ENV) { delete process.env[`${n}_ENABLED`]; delete process.env[`${n}_DRY_RUN`]; }
  Object.assign(process.env, en);
}

describe('PR48 tick e2e: vlaggen aan, DRY_RUN ongewijzigd', () => {
  it('S1 alle vier ENABLED=1 (+ MOMENTUM4 aan): twee handelsdagen lang tikken, nul order-aanroepen, alleen schaduw, geen momentum4', async () => {
    setEnv({ MOMENTUM2_ENABLED: '1', MOMENTUM3_ENABLED: '1', MOMENTUM5_ENABLED: '1', MOMENTUM6_ENABLED: '1', MOMENTUM4_ENABLED: '1', MOMENTUM4_DRY_RUN: '0' });
    process.env.DEEPSEEK_API_KEY = 'nep';
    // ma 2 nov: execute na open, decide na slot, M6 na 00:30 UTC, di 3 nov execute (voert de plannen van ma uit)
    const slots: Array<[string, string]> = [];
    for (let m = 0; m <= 30; m += 5) slots.push([new Date(Date.parse('2026-11-02T00:30:00Z') + m * 60000).toISOString(), '2026-11-02']);
    for (let m = 0; m <= 60; m += 5) slots.push([new Date(Date.parse('2026-11-02T14:45:00Z') + m * 60000).toISOString(), '2026-11-02']);
    for (let m = 0; m <= 60; m += 5) slots.push([new Date(Date.parse('2026-11-02T21:20:00Z') + m * 60000).toISOString(), '2026-11-02']);
    for (let m = 0; m <= 30; m += 5) slots.push([new Date(Date.parse('2026-11-03T00:30:00Z') + m * 60000).toISOString(), '2026-11-03']);
    for (let m = 0; m <= 60; m += 5) slots.push([new Date(Date.parse('2026-11-03T14:45:00Z') + m * 60000).toISOString(), '2026-11-03']);
    for (const [iso, d] of slots) await tick(iso, d);
    const rr = (await q(`SELECT routine, trading_date, started_at, status, skip_reason, error_message FROM routine_runs ORDER BY started_at`)).rows;
    const book = (await q(`SELECT key FROM settings ORDER BY key`)).rows.map((r) => r.key);
    console.log('S1', JSON.stringify({ orderCalls, readCalls: [...new Set(readCalls)], net: [...new Set(netCalls)], runs: rr.map((r) => [r.routine, (r.trading_date as Date).toISOString?.().slice(0, 10) ?? r.trading_date, r.status, r.skip_reason ?? r.error_message ?? '']), startedAtIsDate: rr[0]?.started_at instanceof Date, settings: book, logs }, null, 1));
    expect(orderCalls).toEqual([]);
    expect(rr.some((r) => String(r.routine).startsWith('momentum4'))).toBe(false);
    expect(logs.every((l) => !/"shadow":false/.test(l))).toBe(true);
    expect(rr.filter((r) => r.status === 'ok').length).toBeGreaterThan(0);
  }, 120000);

  it('S2 ENABLED=1 met DRY_RUN=0: weigert (skipped), nog steeds nul order-aanroepen', async () => {
    await pg.exec(`DELETE FROM routine_runs; DELETE FROM routine_run_locks;`);
    logs.length = 0;
    setEnv({ MOMENTUM2_ENABLED: '1', MOMENTUM3_ENABLED: '1', MOMENTUM5_ENABLED: '1', MOMENTUM6_ENABLED: '1', MOMENTUM2_DRY_RUN: '0', MOMENTUM3_DRY_RUN: '0', MOMENTUM5_DRY_RUN: '0', MOMENTUM6_DRY_RUN: '0' });
    await tick('2026-11-02T14:50:00Z', '2026-11-02');
    await tick('2026-11-03T00:35:00Z', '2026-11-03');
    console.log('S2', JSON.stringify({ orderCalls, logs }, null, 1));
    expect(orderCalls).toEqual([]);
    expect(logs.every((l) => / skipped /.test(l))).toBe(true);
  }, 60000);
});
