import { decideDueMomentum, type MomentumJob, type MomentumStep, type MomentumStrategy } from '@scheduler/decide-momentum';
import type { CalendarDay } from '@scheduler/decide';
import { loadGuardState } from '@/lib/guards/service';
import { runMomentum2 } from '@/lib/momentum2/run';
import { runMomentum3 } from '@/lib/momentum3/run';
import { runMomentum5, runMomentum5StopGuard } from '@/lib/momentum5/run';
import { runMomentum6, runMomentum6StopGuard } from '@/lib/momentum6/run';
import { finishRoutineRun, listRecentMomentumRuns, tryBeginRoutineRun } from '@/lib/routine-runs';
import { resolveMomentumPaperMode, resolveShadowMode } from '../../src/momentum2/mode';

type Runner = (step: MomentumStep, nowMs: number) => Promise<Record<string, unknown>>;

/**
 * M2 en M3 kennen alleen schaduw. M5 en M6 gaan met `<NAAM>_DRY_RUN=0` naar Alpaca PAPER (nooit live);
 * de logregel noemt daarom de echte modus, zodat 'schaduw' in de log ook echt schaduw is.
 */
const RUNNERS: Record<MomentumStrategy, Runner> = {
  momentum2: runMomentum2,
  momentum3: runMomentum3,
  momentum5: runMomentum5,
  momentum6: runMomentum6,
};

type StopGuard = (nowMs: number) => Promise<Record<string, unknown> | null>;
const STOP_GUARDS: Partial<Record<MomentumStrategy, StopGuard>> = {
  momentum5: runMomentum5StopGuard,
  momentum6: runMomentum6StopGuard,
};
/**
 * Per strategie loopt er in dit proces nooit meer dan één ding tegelijk (dagstap of stopwacht), ook niet als
 * twee tick-requests elkaar overlappen: anders kan de wacht van tick N+1 het boek van een lopende executeDay
 * overschrijven. Railway draait één web-instantie; de dagstappen hebben daarnaast hun lock in de database.
 */
const strategyBusy = new Set<MomentumStrategy>();

export type MomentumTickDeps = {
  runners?: Partial<Record<MomentumStrategy, Runner>>;
  stopGuards?: Partial<Record<MomentumStrategy, StopGuard>>;
  log?: (line: string) => void;
  env?: Record<string, string | undefined>;
};

export type TickMode = 'schaduw' | 'papier' | 'uit' | 'geblokkeerd';

const FLAG: Record<MomentumStrategy, string> = {
  momentum2: 'MOMENTUM2', momentum3: 'MOMENTUM3', momentum5: 'MOMENTUM5', momentum6: 'MOMENTUM6',
};

/** De modus waarin de runner van deze strategie nu draait, uit dezelfde regels die de runner zelf gebruikt. */
export function momentumTickMode(strategy: MomentumStrategy, env: Record<string, string | undefined>): TickMode {
  const flag = FLAG[strategy];
  if (strategy === 'momentum5' || strategy === 'momentum6') {
    const m = resolveMomentumPaperMode(env, flag);
    return !m.run ? 'uit' : m.shadow ? 'schaduw' : 'papier';
  }
  const m = resolveShadowMode(env, flag);
  if (m.run) return 'schaduw';
  return env[`${flag}_ENABLED`] === '1' ? 'geblokkeerd' : 'uit';
}

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
  const env = deps.env ?? process.env;
  const paper = (['momentum5', 'momentum6'] as const).filter((s) => momentumTickMode(s, env) === 'papier');
  if (!jobs.length && !paper.length) return {};

  const guard = await loadGuardState();
  const out: Record<string, unknown> = {};
  for (const job of jobs) {
    out[job.routine] = await runJob(job, nowMs, guard.emergencyStop, deps, log);
  }
  // Stopwacht elke tick, ook buiten de dagstappen: een stop die ontbreekt wacht niet tot morgen.
  // Ook bij noodstop: een stop beschermt, hij opent niets.
  for (const strategy of paper) {
    const g = deps.stopGuards?.[strategy] ?? STOP_GUARDS[strategy];
    if (!g) continue;
    if (strategyBusy.has(strategy)) {
      log(`[momentum-tick] ${strategy}-stopwacht overgeslagen: ${strategy} loopt nog`);
      continue;
    }
    strategyBusy.add(strategy);
    try {
      const r = await g(nowMs);
      if (r) {
        out[`${strategy}-stopwacht`] = r;
        log(`[momentum-tick] ${strategy}-stopwacht papier ${JSON.stringify(r)}`);
      }
    } catch (e) {
      log(`[momentum-tick] ${strategy}-stopwacht failed papier: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      strategyBusy.delete(strategy);
    }
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
  if (strategyBusy.has(job.strategy)) return { skipped: true, reason: `${job.strategy} loopt nog in dit proces` };
  strategyBusy.add(job.strategy);
  try {
    return await runJobLocked(job, nowMs, emergencyStop, deps, log);
  } finally {
    strategyBusy.delete(job.strategy);
  }
}

async function runJobLocked(
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
  const envMode = momentumTickMode(job.strategy, deps.env ?? process.env);
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
    // de runner meldt zelf of hij in schaduw draaide; zegt hij shadow:false, dan was het papier
    const flags = Object.values(results).map((r) => (r as Record<string, unknown>).shadow);
    const mode: TickMode = flags.includes(false) ? 'papier' : flags.includes(true) ? 'schaduw' : envMode;
    log(`[momentum-tick] ${job.routine} ${job.dayKey} ${status} ${mode} ${JSON.stringify(summary(results))}`);
    return results;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finishRoutineRun(begun.runId, 'failed', { errorMessage: msg, startedMs });
    log(`[momentum-tick] ${job.routine} ${job.dayKey} failed ${envMode}: ${msg}`);
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
      : { date: x.date, shadow: x.shadow, trades: x.trades, planned: x.planned ? Object.keys(x.planned as object).length : undefined };
  }
  return s;
}
