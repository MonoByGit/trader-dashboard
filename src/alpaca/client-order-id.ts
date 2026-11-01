const MAX_LEN = 48;

function compactToken(s: string, max: number): string {
  const cleaned = s.replace(/[^A-Za-z0-9]/g, '');
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(-max);
}

/** Deterministic Alpaca client_order_id (≤48 chars) for crypto and ETF order POST idempotency. */
export function buildAlpacaClientOrderId(input: {
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
}

/** @deprecated Use buildAlpacaClientOrderId */
export const buildEtfClientOrderId = buildAlpacaClientOrderId;
