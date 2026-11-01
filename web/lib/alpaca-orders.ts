import { alpaca, AlpacaOrder } from './alpaca';

const BASE = process.env.ALPACA_BASE_URL ?? 'https://paper-api.alpaca.markets';

function headers() {
  return {
    'APCA-API-KEY-ID': process.env.ALPACA_API_KEY!,
    'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY!,
    'Content-Type': 'application/json',
  };
}

/** Annuleer open stop/limit legs voor een symbool vóór een market close (EOD). */
export async function cancelOpenStopTakeProfitForSymbol(symbol: string): Promise<number> {
  const orders = await alpaca.orders(100);
  let cancelled = 0;
  for (const o of orders) {
    if (o.symbol !== symbol) continue;
    const open = o.status === 'new' || o.status === 'accepted' || o.status === 'held' || o.status === 'partially_filled';
    if (!open || o.side !== 'sell') continue;
    const isLeg = o.type === 'stop' || o.type === 'stop_limit' || o.type === 'limit';
    if (!isLeg) continue;
    try {
      const res = await fetch(`${BASE}/v2/orders/${o.id}`, { method: 'DELETE', headers: headers() });
      if (res.ok) cancelled += 1;
    } catch {
      /* volgende order proberen */
    }
  }
  return cancelled;
}

export function isTakeProfitFill(o: AlpacaOrder): boolean {
  return o.side === 'sell' && o.status === 'filled' && o.type === 'limit' && !o.stop_price;
}

export function isStopFill(o: AlpacaOrder): boolean {
  return o.side === 'sell' && o.status === 'filled' && (o.type === 'stop' || o.type === 'stop_limit' || !!o.stop_price);
}
