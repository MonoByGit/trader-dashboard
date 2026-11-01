<<<<<<< HEAD
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
=======
const MAX_LEN = 48;

function compactToken(s: string, max: number): string {
  const cleaned = s.replace(/[^A-Za-z0-9]/g, '');
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(-max);
}

/** Deterministic Alpaca client_order_id (≤48 chars) for ETF order POST idempotency. */
export function buildEtfClientOrderId(input: {
  routine: string;
  runId: string;
  symbol: string;
  side: 'buy' | 'sell';
  tag?: string;
}): string {
  const routine = compactToken(input.routine.replace(/-/g, ''), 10);
  const run = compactToken(input.runId, 14);
  const symbol = input.symbol.replace(/\//g, '-').replace(/[^A-Za-z0-9-]/g, '');
  const side = input.side;
  const tag = input.tag ? compactToken(input.tag, 6) : '';
  const parts = [routine, run, symbol, side, tag].filter(Boolean);
  let id = parts.join('-').replace(/-+/g, '-');
  if (id.length > MAX_LEN) {
    id = id.slice(0, MAX_LEN);
  }
  return id;
>>>>>>> 8f2f496 (feat(etf): idempotent Alpaca order POSTs with client_order_id)
}
