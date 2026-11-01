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
): Promise<{ runId: string } | { blocked: true; reason: string }> {
  if (!hasDb()) {
    return { runId: `run-${routine}-${nowMs}` };
  }
  await ensureSchema();
  const day = tradingDate ?? tradingDateEt(nowMs);
  const slotKey = routineLockSlotKey(routine, day, nowMs);
  const id = `run-${routine}-${nowMs}`;
  const assetClass = assetClassForRoutine(routine);
  const staleSec = Math.ceil(RUNNING_STALE_MS / 1000);

  return dbTransaction(async (query) => {
    const existing = await query(
      `SELECT run_id, acquired_at FROM routine_run_locks WHERE routine = $1 AND slot_key = $2 FOR UPDATE`,
      [routine, slotKey],
    );
    if (existing.rows.length) {
      const row = existing.rows[0] as { acquired_at: string };
      const ageMs = nowMs - new Date(row.acquired_at).getTime();
      if (ageMs < RUNNING_STALE_MS) {
        return { blocked: true as const, reason: 'Routine run lock held for this slot' };
      }
      await query(`DELETE FROM routine_run_locks WHERE routine = $1 AND slot_key = $2`, [routine, slotKey]);
    }

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
    await query(
      `DELETE FROM routine_run_locks WHERE acquired_at < NOW() - ($1::text || ' seconds')::interval`,
      [String(staleSec)],
    );
    return { runId: id };
  });
}

export async function releaseRoutineRunLock(routine: string, tradingDate: string, nowMs = Date.now()): Promise<void> {
  if (!hasDb()) return;
  await ensureSchema();
  const slotKey = routineLockSlotKey(routine, tradingDate, nowMs);
  await dbRun(`DELETE FROM routine_run_locks WHERE routine = $1 AND slot_key = $2`, [routine, slotKey]);
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
  const rows = await dbQuery<{ routine: string; trading_date: string }>(
    `SELECT routine, trading_date::text AS trading_date FROM routine_runs WHERE id = $1`,
    [id],
  );
  if (rows[0]) {
    await releaseRoutineRunLock(rows[0].routine, rows[0].trading_date);
  }
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
