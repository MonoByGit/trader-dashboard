/** @jest-environment node */
// Dave repro PR 50 (035b4ef3): RoutinesPage vraagt /api/runs?limit=60 en verwacht een array; de route geeft { today, runs }.
// Echte routine_runs-rij in pglite (started_at komt als Date terug), echte listRecentRuns en echte route.
import { jest } from '@jest/globals';
let pg: { query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[] }>; exec: (s: string) => Promise<unknown> };
await jest.unstable_mockModule('@/lib/db', () => ({
  hasDb: () => true,
  dbQuery: async (s: string, p?: unknown[]) => (await pg.query(s, p ?? [])).rows,
  dbRun: async (s: string, p?: unknown[]) => { await pg.query(s, p ?? []); },
  initDb: async () => {},
  dbTransaction: async () => { throw new Error('n.v.t.'); },
}));
await jest.unstable_mockModule('@/lib/migrate', () => ({ ensureSchema: async () => {} }));
beforeAll(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  pg = new PGlite() as unknown as typeof pg;
  await pg.exec(`CREATE TABLE routine_runs (id TEXT PRIMARY KEY, routine TEXT, trading_date DATE, started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ, status TEXT, skip_reason TEXT, error_message TEXT, duration_ms INT, asset_class TEXT);
    INSERT INTO routine_runs VALUES ('r1','momentum6-run','2026-11-01','2026-11-01T16:05:23Z','2026-11-01T16:05:24Z','skipped','MOMENTUM6_ENABLED staat niet aan',null,900,'etf');`);
});
it('Routines-tab toont "Nog geen runs" terwijl er runs zijn', async () => {
  const { GET } = await import('../runs/route');
  const res = await GET(new Request('http://localhost/api/runs?limit=60'));
  const j = await res.json();
  const shownByPage = Array.isArray(j) ? j : []; // exact de regel uit web/components/pages/RoutinesPage.tsx
  console.log('PR50 B1', JSON.stringify({ status: res.status, keys: Object.keys(j), runsInDb: j.runs?.length, shownByPage: shownByPage.length }));
  expect(shownByPage.length).toBe(1);
});
