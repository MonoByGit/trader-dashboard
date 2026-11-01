/** Alpaca client_order_id: max 48 chars, letters, digits, hyphens. */
export function buildAlpacaClientOrderId(parts: {
  routine: string;
  runId: string;
  symbol: string;
  side: string;
}): string {
  const raw = `${parts.routine}-${parts.runId}-${parts.symbol}-${parts.side}`;
  const sanitized = raw
    .replace(/[^A-Za-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return sanitized.slice(0, 48);
}
