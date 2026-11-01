/** Manual Alpaca order POST is disabled; all entries go through guarded routines. */
export const MANUAL_ALPACA_ORDER_POST_ALLOWED = false;

export function manualAlpacaOrderPostBlockedReason(): string {
  return 'Direct order placement is disabled; use scheduled routines with guard checks.';
}
