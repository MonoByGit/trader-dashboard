import { dbQuery, dbRun, hasDb } from './db';
import { ensureSchema } from './migrate';
import { tradingDateEt } from '@scheduler/decide';

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

export async function startRoutineRun(routine: string, tradingDate?: string): Promise<string | null> {
  if (!hasDb()) return null;
  await ensureSchema();
  const id = `run-${routine}-${Date.now()}`;
  const day = tradingDate ?? tradingDateEt(Date.now());
  await dbRun(
    `INSERT INTO routine_runs (id, routine, trading_date, started_at, status)
     VALUES ($1, $2, $3::date, NOW(), 'running')`,
    [id, routine, day],
  );
  return id;
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

export async function getLastFinishedRunMs(routine: string): Promise<number | null> {
  if (!hasDb()) return null;
  await ensureSchema();
  const rows = await dbQuery<{ finished_at: string }>(
    `SELECT finished_at FROM routine_runs
     WHERE routine = $1 AND status IN ('ok', 'skipped', 'failed') AND finished_at IS NOT NULL
     ORDER BY finished_at DESC LIMIT 1`,
    [routine],
  );
  if (!rows.length) return null;
  return new Date(rows[0].finished_at).getTime();
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
