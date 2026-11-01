import { awaitStopOrderCanceled } from '../../../src/crypto/cancel-stop-order';
import { isCryptoSymbol } from '../../../src/asset-classes/classify';
import { positionQtyAvailable } from '../../../src/crypto/buy-fill-qty';
import { alpacaSymbolsEqual } from '../../../src/alpaca/symbol-path';
import type { MomentumBroker, OpenStopOrder } from '../../../src/momentum2/broker-types';
import { brokerStopIsCrypto } from '../../../src/momentum2/reconcile-disaster-stops';
import { alpaca } from '../alpaca';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stopPrefix = (clientPrefix: string, symbol: string) => `${clientPrefix}${symbol}-`;
const OPEN = new Set(['new', 'accepted', 'held', 'pending_new', 'partially_filled']);
const STOP_LIMIT_OFFSET = 0.995;
const stopSeqByKey = new Map<string, number>();

function nextStopClientOrderId(clientPrefix: string, symbol: string, stopPx: number, qty: number): string {
  const key = `${clientPrefix}${symbol}`;
  const seq = (stopSeqByKey.get(key) ?? 0) + 1;
  stopSeqByKey.set(key, seq);
  const qKey = cfgFractionalQtyKey(qty);
  return `${stopPrefix(clientPrefix, symbol)}${qKey}-${Math.round(stopPx * 100)}-${seq}`;
}

function cfgFractionalQtyKey(qty: number): string {
  return qty.toFixed(6).replace(/\.?0+$/, '');
}

export function momentumMarketTimeInForce(symbol: string): 'gtc' | 'day' {
  return isCryptoSymbol(symbol) ? 'gtc' : 'day';
}

function marketTimeInForce(symbol: string): 'gtc' | 'day' {
  return momentumMarketTimeInForce(symbol);
}

function fillFromOrder(cur: { id: string; status: string; filled_qty?: string | null; filled_avg_price?: string | null }): {
  orderId: string;
  qty: number;
  price: number;
} | null {
  const filledQty = Number(cur.filled_qty ?? 0);
  if (filledQty <= 0) return null;
  if (cur.status === 'filled' || cur.status === 'partially_filled') {
    const px = Number(cur.filled_avg_price);
    if (!Number.isFinite(px) || px <= 0) return null;
    return { orderId: cur.id, qty: filledQty, price: px };
  }
  return null;
}

async function pollMarketFill(orderId: string, clientOrderId: string): Promise<{ orderId: string; qty: number; price: number } | null> {
  for (let i = 0; i < 15; i++) {
    const cur = await alpaca.getOrder(orderId);
    const f = fillFromOrder(cur);
    if (f) return f;
    if (['canceled', 'expired', 'rejected'].includes(cur.status)) return null;
    await sleep(1000);
  }
  const byClient = clientOrderId ? await alpaca.getOrderByClientOrderId(clientOrderId) : null;
  if (byClient) {
    const f = fillFromOrder(byClient);
    if (f) return f;
  }
  return null;
}

/**
 * Alpaca PAPER-broker voor Momentum 5/6 (na safety checklist).
 */
export function alpacaPaperBroker(): MomentumBroker {
  return {
    async marketOrder(o) {
      const placed = await alpaca.placeOrder({
        symbol: o.symbol,
        qty: o.qty,
        side: o.side,
        type: 'market',
        time_in_force: marketTimeInForce(o.symbol),
        client_order_id: o.clientOrderId,
      });
      return pollMarketFill(placed.id, o.clientOrderId);
    },

    async setStop(o) {
      const prefix = o.stopClientPrefix;
      const open = (await alpaca.openOrders(200)).filter(
        (x) => x.client_order_id?.startsWith(prefix) && OPEN.has(x.status) && alpacaSymbolsEqual(x.symbol, o.symbol),
      );
      const cur = open.find((x) => x.stop_price);
      const stopPx = Math.max(o.stopPrice, cur ? Number(cur.stop_price) : 0);
      if (cur && Number(cur.stop_price) >= stopPx - 1e-6 && Number(cur.qty) === o.qty) return;

      const clientOrderId = nextStopClientOrderId(prefix, o.symbol, stopPx, o.qty);
      if (brokerStopIsCrypto(o.symbol)) {
        const limit = +(stopPx * STOP_LIMIT_OFFSET).toFixed(2);
        await alpaca.placeOrder({
          symbol: o.symbol,
          qty: o.qty,
          side: 'sell',
          type: 'stop_limit',
          time_in_force: 'gtc',
          stop_price: stopPx,
          limit_price: limit,
          client_order_id: clientOrderId,
        });
      } else {
        await alpaca.placeOrder({
          symbol: o.symbol,
          qty: o.qty,
          side: 'sell',
          type: 'stop',
          time_in_force: 'gtc',
          stop_price: stopPx,
          client_order_id: clientOrderId,
        });
      }

      for (const x of open) {
        if (x.client_order_id === clientOrderId) continue;
        await awaitStopOrderCanceled(x.id, {
          getOrder: (id) => alpaca.getOrder(id),
          cancelOrder: (id) => alpaca.cancelOrder(id),
        });
      }
    },

    async listOpenStops(o) {
      const all = await alpaca.openOrders(200);
      return all
        .filter((x) => x.client_order_id?.startsWith(o.stopClientPrefix) && OPEN.has(x.status) && x.side === 'sell')
        .map((x) => ({
          symbol: x.symbol,
          qty: Number(x.qty),
          stopPrice: Number(x.stop_price ?? 0),
          clientOrderId: x.client_order_id ?? '',
          orderId: x.id,
        }))
        .filter((x) => x.stopPrice > 0 && x.qty > 0);
    },

    async cancelStop(o) {
      if (o.orderId) {
        await awaitStopOrderCanceled(o.orderId, {
          getOrder: (id) => alpaca.getOrder(id),
          cancelOrder: (id) => alpaca.cancelOrder(id),
        });
        return;
      }
      const prefix = stopPrefix(o.stopClientPrefix ?? `m2s-${o.versionId}-`, o.symbol);
      for (const x of await alpaca.openOrders(200)) {
        if (x.client_order_id?.startsWith(prefix) && alpacaSymbolsEqual(x.symbol, o.symbol)) {
          await awaitStopOrderCanceled(x.id, {
            getOrder: (id) => alpaca.getOrder(id),
            cancelOrder: (id) => alpaca.cancelOrder(id),
          });
        }
      }
    },

    async stopFill(o) {
      const prefix = stopPrefix(o.stopClientPrefix, o.symbol);
      const orders = await alpaca.orders(100);
      const hits = orders.filter(
        (x) =>
          x.client_order_id?.startsWith(prefix) &&
          alpacaSymbolsEqual(x.symbol, o.symbol) &&
          x.filled_at &&
          x.filled_at.slice(0, 10) >= o.since.slice(0, 10) &&
          (x.status === 'filled' || x.status === 'partially_filled') &&
          Number(x.filled_qty) > 0,
      );
      hits.sort((a, b) => (a.filled_at! < b.filled_at! ? 1 : -1));
      const hit = hits[0];
      if (!hit?.filled_avg_price) return null;
      return {
        orderId: hit.id,
        qty: Number(hit.filled_qty),
        price: Number(hit.filled_avg_price),
      };
    },

    async positionQty(o) {
      const positions = await alpaca.positions();
      const pos = positions.find((p) => alpacaSymbolsEqual(p.symbol, o.symbol));
      if (!pos) return 0;
      return positionQtyAvailable(pos);
    },
  };
}

type ShadowStop = OpenStopOrder;

export function shadowBroker(lastPrice: Record<string, number>): MomentumBroker {
  const stops: ShadowStop[] = [];
  let seq = 0;
  const posQty: Record<string, number> = {};

  return {
    marketOrder: async (o) => {
      const px = lastPrice[o.symbol] ?? 0;
      if (o.side === 'buy') posQty[o.symbol] = (posQty[o.symbol] ?? 0) + o.qty;
      else posQty[o.symbol] = Math.max(0, (posQty[o.symbol] ?? 0) - o.qty);
      return { orderId: `shadow-${o.clientOrderId}`, qty: o.qty, price: px };
    },
    setStop: async (o) => {
      seq += 1;
      const clientOrderId = `${stopPrefix(o.stopClientPrefix, o.symbol)}${cfgFractionalQtyKey(o.qty)}-${Math.round(o.stopPrice * 100)}-${seq}`;
      const rest = stops.filter((s) => !s.clientOrderId.startsWith(o.stopClientPrefix) || !alpacaSymbolsEqual(s.symbol, o.symbol));
      rest.push({ symbol: o.symbol, qty: o.qty, stopPrice: o.stopPrice, clientOrderId, orderId: clientOrderId });
      stops.length = 0;
      stops.push(...rest);
    },
    cancelStop: async (o) => {
      if (o.orderId) {
        for (let i = stops.length - 1; i >= 0; i--) {
          if (stops[i]!.orderId === o.orderId) stops.splice(i, 1);
        }
        return;
      }
      const prefix = stopPrefix(o.stopClientPrefix ?? `m2s-${o.versionId}-`, o.symbol);
      for (let i = stops.length - 1; i >= 0; i--) {
        if (stops[i]!.clientOrderId.startsWith(prefix) && alpacaSymbolsEqual(stops[i]!.symbol, o.symbol)) {
          stops.splice(i, 1);
        }
      }
    },
    stopFill: async () => null,
    listOpenStops: async (o) => stops.filter((s) => s.clientOrderId.startsWith(o.stopClientPrefix)),
    positionQty: async (o) => posQty[o.symbol] ?? 0,
  };
}
