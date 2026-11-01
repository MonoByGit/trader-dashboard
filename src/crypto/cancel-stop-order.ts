export type StopOrderSnapshot = { status: string; filled_qty?: string };

export async function awaitStopOrderCanceled(
  orderId: string,
  deps: {
    getOrder: (id: string) => Promise<StopOrderSnapshot>;
    cancelOrder: (id: string) => Promise<unknown>;
    delayMs?: number;
    attempts?: number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<'canceled' | 'filled' | 'failed'> {
  const attempts = deps.attempts ?? 12;
  const delayMs = deps.delayMs ?? 250;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  try {
    await deps.cancelOrder(orderId);
  } catch (e) {
    const msg = String(e);
    const statusCode = msg.includes('422') ? 422 : 0;
    if (statusCode === 422) {
      const snap = await deps.getOrder(orderId);
      if (snap.status === 'filled') return 'filled';
      if (snap.status === 'canceled') return 'canceled';
    }
    return 'failed';
  }

  for (let i = 0; i < attempts; i++) {
    const snap = await deps.getOrder(orderId);
    if (snap.status === 'filled') return 'filled';
    if (snap.status === 'canceled' || snap.status === 'expired' || snap.status === 'rejected') {
      return 'canceled';
    }
    if (i < attempts - 1) await sleep(delayMs);
  }
  return 'failed';
}
