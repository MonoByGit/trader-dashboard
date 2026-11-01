import { alpacaHttpStatusFromError } from '../alpaca/parse-http-error.js';

export type StopOrderSnapshot = { status: string; filled_qty?: string };

export type AwaitCancelOutcome = 'canceled' | 'filled' | 'failed' | 'timeout';

const TERMINAL_CANCEL_STATUSES = new Set(['canceled', 'expired', 'rejected']);

export async function awaitStopOrderCanceled(
  orderId: string,
  deps: {
    getOrder: (id: string) => Promise<StopOrderSnapshot>;
    cancelOrder: (id: string) => Promise<unknown>;
    delayMs?: number;
    attempts?: number;
    sleep?: (ms: number) => Promise<void>;
    /** true = tijd op: stoppen met pollen en 'timeout' melden (na minstens één GET). */
    outOfTime?: () => boolean;
  },
): Promise<AwaitCancelOutcome> {
  const attempts = deps.attempts ?? 12;
  const delayMs = deps.delayMs ?? 250;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  let pollOnly = false;
  try {
    await deps.cancelOrder(orderId);
  } catch (e) {
    const status = alpacaHttpStatusFromError(e);
    if (status === 422) {
      const snap = await deps.getOrder(orderId);
      if (snap.status === 'filled') return 'filled';
      if (TERMINAL_CANCEL_STATUSES.has(snap.status)) return 'canceled';
      if (snap.status === 'pending_cancel' || snap.status === 'pending_replace') {
        pollOnly = true;
      } else {
        return 'failed';
      }
    } else {
      return 'failed';
    }
  }

  for (let i = 0; i < attempts; i++) {
    const snap = await deps.getOrder(orderId);
    if (snap.status === 'filled') return 'filled';
    if (TERMINAL_CANCEL_STATUSES.has(snap.status)) return 'canceled';
    if (!pollOnly && i === 0) {
      /* continue polling after successful DELETE */
    }
    if (deps.outOfTime?.()) return 'timeout';
    if (i < attempts - 1) await sleep(delayMs);
  }
  return 'timeout';
}

export async function awaitOrderFilled(
  orderId: string,
  getOrder: (id: string) => Promise<StopOrderSnapshot>,
  options?: { attempts?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> },
): Promise<boolean> {
  const attempts = options?.attempts ?? 12;
  const delayMs = options?.delayMs ?? 250;
  const sleep = options?.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  for (let i = 0; i < attempts; i++) {
    const snap = await getOrder(orderId);
    if (snap.status === 'filled') return true;
    if (TERMINAL_CANCEL_STATUSES.has(snap.status) || snap.status === 'rejected') return false;
    if (i < attempts - 1) await sleep(delayMs);
  }
  return false;
}
