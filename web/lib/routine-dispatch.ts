import { canRunRoutine } from '@guards/index';
import { loadGuardState } from '@/lib/guards/service';
import { finishRoutineRun, tryBeginRoutineRun } from '@/lib/routine-runs';
import { withAiRoutine } from '@/lib/ai';
import { tradingDateEt } from '@scheduler/decide';

type RoutineHandler = () => Promise<Record<string, unknown>>;

const handlers = new Map<string, RoutineHandler>();

export function registerRoutineHandler(routine: string, fn: RoutineHandler): void {
  handlers.set(routine, fn);
}

export async function dispatchRoutine(routine: string): Promise<Record<string, unknown>> {
  const state = await loadGuardState();
  const gate = canRunRoutine({
    routine,
    emergencyStop: state.emergencyStop,
    tradingEnabled: state.tradingEnabled,
    circuitBreakerTripped: state.circuitBreakerTripped,
  });
  const tradingDate = tradingDateEt(Date.now());

  if (!gate.allowed) {
    const begun = await tryBeginRoutineRun(routine, tradingDate);
    const runId = 'blocked' in begun ? null : begun.runId;
    const started = Date.now();
    await finishRoutineRun(runId, 'skipped', { skipReason: gate.reason, startedMs: started });
    return { skipped: true, reason: gate.reason };
  }

  const handler = handlers.get(routine);
  if (!handler) {
    return { error: 'Unknown routine' };
  }

  const begun = await tryBeginRoutineRun(routine, tradingDate);
  if ('blocked' in begun) {
    return { skipped: true, reason: begun.reason };
  }
  const runId = begun.runId;
  const startedMs = Date.now();

  try {
    const result = await withAiRoutine(routine, handler);
    if (result.skipped) {
      await finishRoutineRun(runId, 'skipped', {
        skipReason: String(result.reason ?? 'skipped'),
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
