import { dbQuery, dbRun, dbTransaction, hasDb } from './db';
import { ensureSchema } from './migrate';
import { tradingDateEt } from '@scheduler/decide';
import { routineLockSlotKey } from '@scheduler/routine-lock';
import { RUNNING_STALE_MS } from '@scheduler/run-status';

export type RunStatus = 'running' | 'ok' | 'failed' | 'skipped';

export interface RoutineRunRow {
  id: string;
  routine: string;
  trading_date: string;
  started_at: string;
  finished_at: string | null;
  status: RunStatus;
  skip_reason: string | null;
  duration_ms: number | null;
  error_message: string | null;
}

function assetClassForRoutine(routine: string): 'etf' | 'crypto' {
  return routine.startsWith('crypto') ? 'crypto' : 'etf';
}

export async function startRoutineRun(routine: string, tradingDate?: string): Promise<string | null> {
  const begun = await tryBeginRoutineRun(routine, tradingDate);
  if ('blocked' in begun) return null;
  return begun.runId;
}

export async function tryBeginRoutineRun(
  routine: string,
  tradingDate?: string,
  nowMs = Date.now(),
): Promise<{ runId: string; slotKey: string } | { blocked: true; reason: string }> {
  if (!hasDb()) {
    return { runId: `run-${routine}-${nowMs}`, slotKey: routineLockSlotKey(routine, tradingDateEt(nowMs), nowMs) };
  }
  await ensureSchema();
  const day = tradingDate ?? tradingDateEt(nowMs);
  const slotKey = routineLockSlotKey(routine, day, nowMs);
  const id = `run-${routine}-${nowMs}`;
  const assetClass = assetClassForRoutine(routine);
  const staleSec = Math.ceil(RUNNING_STALE_MS / 1000);

  return dbTransaction(async (query) => {
    const existing = await query(
      `SELECT run_id, acquired_at FROM routine_run_locks
       WHERE routine = $1 AND slot_key = $2
         AND acquired_at > NOW() - ($3::text || ' seconds')::interval
       FOR UPDATE`,
      [routine, slotKey, String(staleSec)],
    );
    if (existing.rows.length) {
      return { blocked: true as const, reason: 'Routine run lock held for this slot' };
    }

    await query(
      `DELETE FROM routine_run_locks
       WHERE routine = $1 AND slot_key = $2
         AND acquired_at <= NOW() - ($3::text || ' seconds')::interval`,
      [routine, slotKey, String(staleSec)],
    );

    const lock = await query(
      `INSERT INTO routine_run_locks (routine, slot_key, run_id, acquired_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (routine, slot_key) DO NOTHING
       RETURNING run_id`,
      [routine, slotKey, id],
    );
    if (!lock.rowCount) {
      return { blocked: true as const, reason: 'Routine run lock conflict' };
    }

    await query(
      `INSERT INTO routine_runs (id, routine, trading_date, started_at, status, asset_class)
       VALUES ($1, $2, $3::date, NOW(), 'running', $4)`,
      [id, routine, day, assetClass],
    );
    return { runId: id, slotKey };
  });
}

export async function verifyRoutineRunLock(runId: string): Promise<boolean> {
  if (!hasDb()) return true;
  await ensureSchema();
  const staleSec = Math.ceil(RUNNING_STALE_MS / 1000);
  const rows = await dbQuery<{ ok: string }>(
    `SELECT 1::text AS ok FROM routine_run_locks
     WHERE run_id = $1
       AND acquired_at > NOW() - ($2::text || ' seconds')::interval
     LIMIT 1`,
    [runId, String(staleSec)],
  );
  return rows.length > 0;
}

export async function releaseRoutineRunLock(runId: string): Promise<void> {
  if (!hasDb()) return;
  await ensureSchema();
  await dbRun(`DELETE FROM routine_run_locks WHERE run_id = $1`, [runId]);
}

export async function finishRoutineRun(
  id: string | null,
  status: RunStatus,
  opts?: { skipReason?: string; errorMessage?: string; startedMs?: number },
): Promise<void> {
  if (!id || !hasDb()) return;
  await ensureSchema();
  const duration =
    opts?.startedMs != null ? Math.max(0, Date.now() - opts.startedMs) : null;
  await dbRun(
    `UPDATE routine_runs SET finished_at = NOW(), status = $2, skip_reason = $3, error_message = $4, duration_ms = $5
     WHERE id = $1`,
    [id, status, opts?.skipReason ?? null, opts?.errorMessage ?? null, duration],
  );
  await releaseRoutineRunLock(id);
}

export async function listRunsForTradingDate(tradingDate: string): Promise<RoutineRunRow[]> {
  if (!hasDb()) return [];
  await ensureSchema();
  return dbQuery<RoutineRunRow>(
    `SELECT id, routine, trading_date::text AS trading_date, started_at, finished_at, status, skip_reason, duration_ms, error_message
     FROM routine_runs WHERE trading_date = $1::date ORDER BY started_at DESC`,
    [tradingDate],
  );
}

export async function listRecentRuns(limit = 100): Promise<RoutineRunRow[]> {
  if (!hasDb()) return [];
  await ensureSchema();
  return dbQuery<RoutineRunRow>(
    `SELECT id, routine, trading_date::text AS trading_date, started_at, finished_at, status, skip_reason, duration_ms, error_message
     FROM routine_runs ORDER BY started_at DESC LIMIT $1`,
    [limit],
  );
}

export async function listRecentRunsByRoutine(routine: string, limit = 20): Promise<RoutineRunRow[]> {
  if (!hasDb()) return [];
  await ensureSchema();
  return dbQuery<RoutineRunRow>(
    `SELECT id, routine, trading_date::text AS trading_date, started_at, finished_at, status, skip_reason, duration_ms, error_message
     FROM routine_runs WHERE routine = $1 ORDER BY started_at DESC LIMIT $2`,
    [routine, limit],
  );
}
