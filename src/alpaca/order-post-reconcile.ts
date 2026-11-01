import { alpacaHttpStatusFromError } from './parse-http-error.js';

export function isOrderPostRetryableError(error: unknown): boolean {
  if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return true;
  }
  if (error instanceof Error && /aborted|timeout/i.test(error.message)) return true;
  const status = alpacaHttpStatusFromError(error);
  return status !== null && status >= 500;
}

export type OrderPostDeps<T extends { id: string }> = {
  submit: () => Promise<T>;
  lookupByClientOrderId: (clientOrderId: string) => Promise<T | null>;
};

/** POST an order; on timeout/5xx, reconcile via client_order_id lookup. */
export async function placeOrderWithReconcile<T extends { id: string }>(
  clientOrderId: string | undefined,
  deps: OrderPostDeps<T>,
): Promise<T> {
  try {
    return (await deps.submit()) as T;
  } catch (error) {
    if (!clientOrderId || !isOrderPostRetryableError(error)) throw error;
    const found = await deps.lookupByClientOrderId(clientOrderId);
    if (found) return found as T;
    throw error;
  }
}
