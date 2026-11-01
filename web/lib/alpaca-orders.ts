import { assertAlpacaPaperTrading, alpacaTradingBaseUrl } from '../../src/alpaca/paper-host';
import { flattenReadyAfterCancels, openSellLegsStillActive } from '../../src/trading/eod-flatten';
import { alpaca, AlpacaOrder } from './alpaca';

const BASE = alpacaTradingBaseUrl();

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
      assertAlpacaPaperTrading(BASE);
      const res = await fetch(`${BASE}/v2/orders/${o.id}`, { method: 'DELETE', headers: headers() });
      if (res.ok) cancelled += 1;
    } catch {
      /* volgende order proberen */
    }
  }
  return cancelled;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openSellLegsForSymbol(symbol: string): Promise<Array<{ id: string; status: string }>> {
  const orders = await alpaca.orders(100);
  const openStatuses = new Set(['new', 'accepted', 'held', 'partially_filled', 'pending_new']);
  return orders
    .filter(
      (o) =>
        o.symbol === symbol &&
        o.side === 'sell' &&
        openStatuses.has(o.status) &&
        (o.type === 'stop' || o.type === 'stop_limit' || o.type === 'limit'),
    )
    .map((o) => ({ id: o.id, status: o.status }));
}

/** Cancel bracket/stop legs and poll until cleared before EOD market close. */
export async function cancelSellLegsAndWait(symbol: string, opts?: { maxAttempts?: number; delayMs?: number }): Promise<{
  cancelled: number;
  ready: boolean;
  remainingLegs: Array<{ id: string; status: string }>;
}> {
  const maxAttempts = opts?.maxAttempts ?? 8;
  const delayMs = opts?.delayMs ?? 400;
  let cancelled = 0;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    cancelled += await cancelOpenStopTakeProfitForSymbol(symbol);
    const legs = await openSellLegsForSymbol(symbol);
    if (flattenReadyAfterCancels(legs)) {
      return { cancelled, ready: true, remainingLegs: [] };
    }
    if (attempt < maxAttempts - 1) await sleep(delayMs);
  }
  const remaining = openSellLegsStillActive(await openSellLegsForSymbol(symbol));
  return { cancelled, ready: remaining.length === 0, remainingLegs: remaining };
}

export function isTakeProfitFill(o: AlpacaOrder): boolean {
  return o.side === 'sell' && o.status === 'filled' && o.type === 'limit' && !o.stop_price;
}

export async function hasOpenBuyOrderForSymbol(symbol: string): Promise<boolean> {
  const orders = await alpaca.openOrders(100);
  return orders.some(
    (o) =>
      o.symbol === symbol &&
      o.side === 'buy' &&
      (o.status === 'new' ||
        o.status === 'accepted' ||
        o.status === 'held' ||
        o.status === 'partially_filled' ||
        o.status === 'pending_new'),
  );
}

export function isStopFill(o: AlpacaOrder): boolean {
  return o.side === 'sell' && o.status === 'filled' && (o.type === 'stop' || o.type === 'stop_limit' || !!o.stop_price);
}
