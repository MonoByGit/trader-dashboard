/** @jest-environment node */
import { jest } from '@jest/globals';

let pg: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; affectedRows?: number }>; exec: (sql: string) => Promise<void> };

async function q(sql: string, params: unknown[] = []) {
  const r = await pg.query(sql, params);
  return { rows: r.rows as Record<string, unknown>[], rowCount: r.affectedRows ?? (r.rows as unknown[]).length };
}

beforeAll(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  pg = new PGlite();
  await pg.exec(`CREATE TABLE routine_run_locks (
    routine TEXT NOT NULL,
    slot_key TEXT NOT NULL,
    run_id TEXT NOT NULL,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (routine, slot_key)
  );
  CREATE TABLE routine_runs (
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
});

describe('B-2 lock on real Postgres (pglite)', () => {
  beforeEach(async () => {
    jest.resetModules();
    await pg.exec('DELETE FROM routine_run_locks; DELETE FROM routine_runs;');
  });

  it('stale takeover, owner-bound release, fencing', async () => {
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
    const now = Date.parse('2026-11-01T12:01:00Z');
    const a = await rr.tryBeginRoutineRun('crypto-scan', '2026-11-01', now);
    expect('runId' in a).toBe(true);
    if (!('runId' in a)) return;

    const b1 = await rr.tryBeginRoutineRun('crypto-scan', '2026-11-01', now + 60_000);
    expect(b1).toMatchObject({ blocked: true });

    await pg.query(`UPDATE routine_run_locks SET acquired_at = NOW() - interval '14 minutes'`);
    const mid = await rr.tryBeginRoutineRun('crypto-scan', '2026-11-01', now + 120_000);
    expect(mid).toMatchObject({ blocked: true });

    await pg.query(`UPDATE routine_run_locks SET acquired_at = NOW() - interval '16 minutes'`);
    expect(await rr.verifyRoutineRunLock(a.runId)).toBe(true);

    const b = await rr.tryBeginRoutineRun('crypto-scan', '2026-11-01', now + 180_000);
    expect('runId' in b).toBe(true);
    if (!('runId' in b)) return;

    expect(await rr.verifyRoutineRunLock(a.runId)).toBe(false);
    expect(await rr.verifyRoutineRunLock(b.runId)).toBe(true);

    await rr.finishRoutineRun(a.runId, 'ok', { startedMs: now });
    expect(await rr.verifyRoutineRunLock(b.runId)).toBe(true);

    await rr.finishRoutineRun(b.runId, 'ok', { startedMs: now });
    expect(await rr.verifyRoutineRunLock(b.runId)).toBe(false);
  });

  it('listRecentRunsByRoutine returns ISO strings for timestamptz columns', async () => {
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

    await pg.query(
      `INSERT INTO routine_runs (id, routine, trading_date, started_at, finished_at, status, asset_class)
       VALUES
         ('run-a', 'crypto-scan', '2026-11-01', '2026-11-01T10:00:00Z', '2026-11-01T10:06:00Z', 'ok', 'crypto'),
         ('run-b', 'crypto-scan', '2026-11-01', '2026-11-01T12:00:00Z', '2026-11-01T12:05:00Z', 'ok', 'crypto')`,
    );

    const rr = await import('@/lib/routine-runs');
    const runs = await rr.listRecentRunsByRoutine('crypto-scan', 10);
    expect(runs).toHaveLength(2);
    for (const row of runs) {
      expect(typeof row.started_at).toBe('string');
      expect(row.finished_at === null || typeof row.finished_at === 'string').toBe(true);
    }
  });
});
