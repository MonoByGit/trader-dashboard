import { getRoutineRunContext } from './routine-run-context';

export const AI_SINGLE_CALL_TIMEOUT_MS = 150_000;
export const ROUTINE_RUN_DEADLINE_MS = 12 * 60_000;

export function mergeAbortSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (a.aborted) return a;
  if (b.aborted) return b;
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  a.addEventListener('abort', onAbort);
  b.addEventListener('abort', onAbort);
  return ctrl.signal;
}

export function abortSignalAfterMs(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  if (typeof t === 'object' && 'unref' in t) (t as NodeJS.Timeout).unref();
  return ctrl.signal;
}

export function aiFetchSignal(): AbortSignal {
  const perCall = abortSignalAfterMs(AI_SINGLE_CALL_TIMEOUT_MS);
  const run = getRoutineRunContext();
  if (!run) return perCall;
  const remaining = run.deadlineMs - Date.now();
  if (remaining <= 0) return abortSignalAfterMs(1);
  return mergeAbortSignals(perCall, abortSignalAfterMs(remaining));
}

export async function withAiAbort<T>(promise: Promise<T>, signal = aiFetchSignal()): Promise<T> {
  if (signal.aborted) {
    throw new Error('AI call aborted (timeout or routine deadline)');
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error('AI call aborted (timeout or routine deadline)'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}
