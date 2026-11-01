import type { RoutineRunRecord } from './decide.js';

export const RUNNING_STALE_MS = 15 * 60_000;

export type SchedulerRunStatus = 'ok' | 'failed' | 'skipped' | 'running' | 'stale';

/** Map DB run row to scheduler status (running stays running until stale). */
export function schedulerStatusFromRun(
  run: Pick<RoutineRunRecord, 'status' | 'started_at'>,
  nowMs: number,
): SchedulerRunStatus {
  if (run.status !== 'running') return run.status as SchedulerRunStatus;
  if (!run.started_at) return 'running';
  const age = nowMs - new Date(run.started_at).getTime();
  return age >= RUNNING_STALE_MS ? 'stale' : 'running';
}

/** Whether a new dispatch should be scheduled for this routine slot. */
export function shouldScheduleRoutineRun(
  last: RoutineRunRecord | undefined,
  nowMs: number,
  retryWindowMinutes: number,
): boolean {
  if (!last) return true;
  const status = schedulerStatusFromRun(last, nowMs);
  if (status === 'ok' || status === 'skipped') return false;
  if (status === 'running') return false;
  if (status === 'failed' && last.finished_at) {
    const finishedMs = new Date(last.finished_at).getTime();
    if (nowMs - finishedMs > retryWindowMinutes * 60_000) return false;
    return true;
  }
  if (status === 'stale') return true;
  if (status === 'failed' && !last.finished_at) return false;
  return true;
}
