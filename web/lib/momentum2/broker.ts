import { alpacaSymbolsEqual } from '../../../src/alpaca/symbol-path';
import {
  makeAlpacaPaperBroker,
  momentumMarketTimeInForce,
  type AlpacaPaperClient,
} from '../../../src/momentum2/alpaca-paper-broker';
import type { MomentumBroker, OpenStopOrder } from '../../../src/momentum2/broker-types';
import { alpaca } from '../alpaca';

export { momentumMarketTimeInForce };

const stopPrefix = (clientPrefix: string, symbol: string) => `${clientPrefix}${symbol}-`;
const cfgFractionalQtyKey = (qty: number) => qty.toFixed(6).replace(/\.?0+$/, '');

/** Alpaca PAPER-broker voor Momentum 5/6 (na safety checklist). De logica staat in src/momentum2/alpaca-paper-broker.ts. */
export function alpacaPaperBroker(): MomentumBroker {
  const client: AlpacaPaperClient = {
    placeOrder: (o) => alpaca.placeOrder(o),
    replaceOrder: (id, o) => alpaca.replaceOrder(id, o),
    openOrders: (n) => alpaca.openOrders(n),
    orders: (n) => alpaca.orders(n),
    getOrder: (id) => alpaca.getOrder(id),
    getOrderByClientOrderId: (id) => alpaca.getOrderByClientOrderId(id),
    cancelOrder: (id) => alpaca.cancelOrder(id),
    positions: () => alpaca.positions(),
  };
  return makeAlpacaPaperBroker(client);
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
