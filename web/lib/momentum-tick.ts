import { decideDueMomentum, type MomentumJob, type MomentumStep, type MomentumStrategy } from '@scheduler/decide-momentum';
import type { CalendarDay } from '@scheduler/decide';
import { loadGuardState } from '@/lib/guards/service';
import { runMomentum2 } from '@/lib/momentum2/run';
import { runMomentum3 } from '@/lib/momentum3/run';
import { runMomentum5 } from '@/lib/momentum5/run';
import { runMomentum6 } from '@/lib/momentum6/run';
import { finishRoutineRun, listRecentMomentumRuns, tryBeginRoutineRun } from '@/lib/routine-runs';

type Runner = (step: MomentumStep, nowMs: number) => Promise<Record<string, unknown>>;

/** Alle vier lopen in deze versie alleen in schaduw: hun run-functies kennen geen pad naar echte orders. */
const RUNNERS: Record<MomentumStrategy, Runner> = {
  momentum2: runMomentum2,
  momentum3: runMomentum3,
  momentum5: runMomentum5,
  momentum6: runMomentum6,
};

export type MomentumTickDeps = {
  runners?: Partial<Record<MomentumStrategy, Runner>>;
  log?: (line: string) => void;
};

/**
 * Draai de Momentum-schaduwstappen die nu aan de beurt zijn. Elke stap één keer per dag (routine_runs),
 * met lock; een fout in één strategie raakt de rest en de M1-routines niet.
 */
export async function runMomentumTick(
  nowMs: number,
  calendarToday: CalendarDay | null,
  deps: MomentumTickDeps = {},
): Promise<Record<string, unknown>> {
  const log = deps.log ?? ((l: string) => console.log(l));
  const since = new Date(nowMs - 3 * 86_400_000).toISOString().slice(0, 10);
  const runs = await listRecentMomentumRuns(since);
  const jobs = decideDueMomentum({ nowMs, calendarToday, runs });
  if (!jobs.length) return {};

  const guard = await loadGuardState();
  const out: Record<string, unknown> = {};
  for (const job of jobs) {
    out[job.routine] = await runJob(job, nowMs, guard.emergencyStop, deps, log);
  }
  return out;
}

async function runJob(
  job: MomentumJob,
  nowMs: number,
  emergencyStop: boolean,
  deps: MomentumTickDeps,
  log: (l: string) => void,
): Promise<Record<string, unknown>> {
  const begun = await tryBeginRoutineRun(job.routine, job.dayKey, nowMs);
  if ('blocked' in begun) return { skipped: true, reason: begun.reason };
  const startedMs = Date.now();

  if (emergencyStop) {
    await finishRoutineRun(begun.runId, 'skipped', { skipReason: 'Emergency stop (noodstop) active', startedMs });
    log(`[momentum-tick] ${job.routine} ${job.dayKey} skipped: noodstop`);
    return { skipped: true, reason: 'noodstop' };
  }

  const run = deps.runners?.[job.strategy] ?? RUNNERS[job.strategy];
  const results: Record<string, unknown> = {};
  try {
    let skippedReason: string | null = null;
    for (const step of job.steps) {
      const r = await run(step, nowMs);
      results[step] = r;
      if (r.skipped) skippedReason = String(r.reason ?? 'skipped');
    }
    const status = skippedReason ? 'skipped' : 'ok';
    await finishRoutineRun(begun.runId, status, { skipReason: skippedReason ?? undefined, startedMs });
    log(
      `[momentum-tick] ${job.routine} ${job.dayKey} ${status} schaduw ${JSON.stringify(summary(results))}`,
    );
    return results;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finishRoutineRun(begun.runId, 'failed', { errorMessage: msg, startedMs });
    log(`[momentum-tick] ${job.routine} ${job.dayKey} failed: ${msg}`);
    return { error: msg };
  }
}

/** Korte logregel: geen boeken of prijzen, alleen wat er gebeurde. */
function summary(results: Record<string, unknown>): Record<string, unknown> {
  const s: Record<string, unknown> = {};
  for (const [step, r] of Object.entries(results)) {
    const x = r as Record<string, unknown>;
    s[step] = x.skipped
      ? { skipped: x.reason }
      : { date: x.date, shadow: x.shadow ?? true, trades: x.trades, planned: x.planned ? Object.keys(x.planned as object).length : undefined };
  }
  return s;
}
