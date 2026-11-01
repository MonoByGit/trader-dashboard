import { alpaca } from '../alpaca';
import type { Broker, Fill } from '../../../src/momentum2/live';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stopPrefix = (versionId: string, symbol: string) => `m2s-${versionId}-${symbol}-`;
const OPEN = new Set(['new', 'accepted', 'held', 'pending_new', 'partially_filled']);

/**
 * NIET AANSLUITEN op de route voordat de checklist in docs/momentum-2.md (echte orders) is afgewerkt.
 * Alpaca PAPER-broker. alpaca.ts weigert elke niet-paper host (assertAlpacaPaperTrading).
 * Elke versie heeft per symbool een eigen GTC-stop; een stop gaat alleen omhoog.
 */
export function alpacaPaperBroker(): Broker {
  return {
    async marketOrder(o): Promise<Fill | null> {
      const placed = await alpaca.placeOrder({
        symbol: o.symbol, qty: o.qty, side: o.side, type: 'market', time_in_force: 'day', client_order_id: o.clientOrderId,
      });
      for (let i = 0; i < 15; i++) {
        const cur = await alpaca.getOrder(placed.id);
        if (cur.status === 'filled' && cur.filled_avg_price) {
          return { orderId: cur.id, qty: Number(cur.filled_qty), price: Number(cur.filled_avg_price) };
        }
        if (['canceled', 'expired', 'rejected'].includes(cur.status)) return null;
        await sleep(1000);
      }
      return null; // niet bevestigd: niet in het boek zetten, de volgende beslissing ziet de echte stand
    },

    async setStop(o) {
      const prefix = stopPrefix(o.versionId, o.symbol);
      const open = (await alpaca.openOrders(100)).filter((x) => x.client_order_id?.startsWith(prefix) && OPEN.has(x.status));
      const cur = open.find((x) => x.stop_price);
      if (cur && Number(cur.stop_price) >= o.stopPrice && Number(cur.qty) === o.qty) return; // alleen omhoog
      for (const x of open) await alpaca.cancelOrder(x.id);
      await alpaca.placeOrder({
        symbol: o.symbol, qty: o.qty, side: 'sell', type: 'stop', time_in_force: 'gtc',
        stop_price: Math.max(o.stopPrice, cur ? Number(cur.stop_price) : 0),
        client_order_id: `${prefix}${Date.now()}`,
      });
    },

    async cancelStop(o) {
      const prefix = stopPrefix(o.versionId, o.symbol);
      for (const x of await alpaca.openOrders(100)) {
        if (x.client_order_id?.startsWith(prefix)) await alpaca.cancelOrder(x.id);
      }
    },

    async stopFill(o): Promise<Fill | null> {
      const prefix = stopPrefix(o.versionId, o.symbol);
      const hit = (await alpaca.orders(100)).find(
        (x) => x.client_order_id?.startsWith(prefix) && x.status === 'filled' && x.filled_at && x.filled_at.slice(0, 10) >= o.since,
      );
      return hit && hit.filled_avg_price
        ? { orderId: hit.id, qty: Number(hit.filled_qty), price: Number(hit.filled_avg_price) }
        : null;
    },
  };
}

/** Schaduwmodus: geen enkele order naar Alpaca, vullingen op de laatste koers. */
export function shadowBroker(lastPrice: Record<string, number>): Broker {
  return {
    marketOrder: async (o) => ({ orderId: `shadow-${o.clientOrderId}`, qty: o.qty, price: lastPrice[o.symbol] ?? 0 }),
    setStop: async () => {},
    cancelStop: async () => {},
    stopFill: async () => null,
  };
}
