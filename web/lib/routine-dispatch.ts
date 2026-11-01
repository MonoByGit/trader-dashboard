import { canRunRoutine } from '@guards/index';
import { loadGuardState } from '@/lib/guards/service';
import {
  finishRoutineRun,
  recordFailedRoutineRunAttempt,
  tryBeginRoutineRun,
} from '@/lib/routine-runs';
import { withAiRoutine } from '@/lib/ai';
import { tradingDateEt } from '@scheduler/decide';
import { withRoutineRunContext } from '@/lib/routine-run-context';
import { ROUTINE_RUN_DEADLINE_MS } from '@/lib/ai-timeout';

type RoutineHandler = () => Promise<Record<string, unknown>>;

const handlers = new Map<string, RoutineHandler>();

export function registerRoutineHandler(routine: string, fn: RoutineHandler): void {
  handlers.set(routine, fn);
}

function flattenFailuresFrom(result: Record<string, unknown>): string[] {
  const ff = result.flattenFailures;
  if (!Array.isArray(ff)) return [];
  return ff.map(String);
}

export async function dispatchRoutine(
  routine: string,
  nowMs: number = Date.now(),
): Promise<Record<string, unknown>> {
  const state = await loadGuardState();
  const gate = canRunRoutine({
    routine,
    emergencyStop: state.emergencyStop,
    tradingEnabled: state.tradingEnabled,
    circuitBreakerTripped: state.circuitBreakerTripped,
  });
  const tradingDate = tradingDateEt(nowMs);

  if (!gate.allowed) {
    let begun: Awaited<ReturnType<typeof tryBeginRoutineRun>>;
    try {
      begun = await tryBeginRoutineRun(routine, tradingDate, nowMs);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await recordFailedRoutineRunAttempt(routine, tradingDate, msg, nowMs);
      throw e;
    }
    const runId = 'blocked' in begun ? null : begun.runId;
    const started = nowMs;
    await finishRoutineRun(runId, 'skipped', { skipReason: gate.reason, startedMs: started });
    return { skipped: true, reason: gate.reason };
  }

  const handler = handlers.get(routine);
  if (!handler) {
    return { error: 'Unknown routine' };
  }

  let begun: Awaited<ReturnType<typeof tryBeginRoutineRun>>;
  try {
    begun = await tryBeginRoutineRun(routine, tradingDate, nowMs);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordFailedRoutineRunAttempt(routine, tradingDate, msg, nowMs);
    throw e;
  }
  if ('blocked' in begun) {
    return { skipped: true, reason: begun.reason };
  }
  const runId = begun.runId;
  const startedMs = nowMs;
  const deadlineMs = startedMs + ROUTINE_RUN_DEADLINE_MS;

  try {
    const result = await withRoutineRunContext(
      { runId, routine, tradingDate, slotKey: begun.slotKey, deadlineMs },
      () => withAiRoutine(routine, handler),
    );
    const flattenFailures = flattenFailuresFrom(result);
    if (result.skipped) {
      await finishRoutineRun(runId, 'skipped', {
        skipReason: String(result.reason ?? 'skipped'),
        startedMs,
      });
    } else if (flattenFailures.length > 0) {
      await finishRoutineRun(runId, 'failed', {
        errorMessage: flattenFailures.join('; '),
        startedMs,
      });
    } else {
      await finishRoutineRun(runId, 'ok', { startedMs });
    }
    return result;
  } catch (e) {
    await finishRoutineRun(runId, 'failed', {
      errorMessage: String(e),
      startedMs,
    });
    throw e;
  }
}
