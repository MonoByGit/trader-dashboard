/** @jest-environment node */
import { jest } from '@jest/globals';

let pg: {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; affectedRows?: number }>;
  exec: (sql: string) => Promise<void>;
};

async function q(sql: string, params: unknown[] = []) {
  const r = await pg.query(sql, params);
  return { rows: r.rows as Record<string, unknown>[], rowCount: r.affectedRows ?? (r.rows as unknown[]).length };
}

describe('scheduler tick lock migration', () => {
  beforeAll(async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    pg = new PGlite();
    await pg.exec(`CREATE TABLE routine_runs (
      id TEXT PRIMARY KEY,
      routine TEXT,
      trading_date DATE,
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      status TEXT,
      skip_reason TEXT,
      error_message TEXT,
      duration_ms INT,
      asset_class TEXT
    );`);
    // routine_run_locks intentionally missing (simulates DB before PR 31 migrate applied)
  });

  afterAll(async () => {
    if (pg && 'close' in pg && typeof pg.close === 'function') await pg.close();
  });

  beforeEach(() => {
    jest.resetModules();
  });

  it('tryBeginRoutineRun succeeds after ensureRoutineRunLocksTable (PR 31 first-use)', async () => {
    jest.unstable_mockModule('@/lib/db', () => ({
      hasDb: () => true,
      dbQuery: async (s: string, p?: unknown[]) => (await q(s, p ?? [])).rows,
      dbRun: async (s: string, p?: unknown[]) => {
        await q(s, p ?? []);
      },
      initDb: async () => {},
      dbTransaction: async (fn: (query: typeof q) => Promise<unknown>) => {
        await pg.query('BEGIN');
        try {
          const r = await fn(q);
          await pg.query('COMMIT');
          return r;
        } catch (e) {
          await pg.query('ROLLBACK');
          throw e;
        }
      },
    }));
    jest.unstable_mockModule('@/lib/migrate', () => ({ ensureSchema: async () => {} }));

    const rr = await import('@/lib/routine-runs');
    await pg.exec(`CREATE TABLE IF NOT EXISTS routine_run_locks (
      routine TEXT NOT NULL,
      slot_key TEXT NOT NULL,
      run_id TEXT NOT NULL,
      acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (routine, slot_key)
    );`);
    const now = Date.parse('2026-11-01T10:05:00Z');
    const begun = await rr.tryBeginRoutineRun('crypto-scan', '2026-11-01', now);
    expect('runId' in begun).toBe(true);
  });

});
