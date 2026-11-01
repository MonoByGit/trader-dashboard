import { isCryptoSymbol } from '../asset-classes/classify';
import { alpacaSymbolsEqual } from '../alpaca/symbol-path';
import { alpacaHttpStatusFromError } from '../alpaca/parse-http-error';
import { awaitStopOrderCanceled, type AwaitCancelOutcome } from '../crypto/cancel-stop-order';
import type { CancelStopOutcome, MomentumBroker } from './broker-types';
import type { Fill } from './live';

/** Het stukje Alpaca dat de Momentum-broker nodig heeft; los van web/ zodat het zonder netwerk te testen is. */
export type AlpacaOrderLike = {
  id: string;
  client_order_id?: string;
  symbol: string;
  side: string;
  qty: string;
  filled_qty: string;
  type: string;
  status: string;
  filled_at: string | null;
  filled_avg_price: string | null;
  stop_price: string | null;
  limit_price?: string | null;
};

export type AlpacaPositionLike = { symbol: string; qty: string; qty_available?: string };

export interface AlpacaPaperClient {
  placeOrder(o: {
    symbol: string;
    qty: number;
    side: 'buy' | 'sell';
    type: 'market' | 'stop' | 'stop_limit';
    time_in_force: 'gtc' | 'day';
    stop_price?: number;
    limit_price?: number;
    client_order_id: string;
  }): Promise<AlpacaOrderLike>;
  /** PATCH /v2/orders/{id}: geeft de nieuwe order terug; de oude gaat naar 'replaced'. */
  replaceOrder(
    orderId: string,
    o: { qty?: number; stop_price?: number; limit_price?: number; client_order_id?: string },
  ): Promise<AlpacaOrderLike>;
  openOrders(limit: number): Promise<AlpacaOrderLike[]>;
  orders(limit: number): Promise<AlpacaOrderLike[]>;
  getOrder(id: string): Promise<AlpacaOrderLike>;
  getOrderByClientOrderId(clientOrderId: string): Promise<AlpacaOrderLike | null>;
  cancelOrder(id: string): Promise<unknown>;
  positions(): Promise<AlpacaPositionLike[]>;
}

export const OPEN_STATUSES = new Set(['new', 'accepted', 'held', 'pending_new', 'partially_filled', 'pending_replace']);
const TERMINAL = new Set(['filled', 'canceled', 'expired', 'rejected', 'replaced', 'done_for_day']);
/** stop_limit voor crypto: limiet 0,5% onder de stop. Alpaca kent geen GTC stop-market voor crypto. */
export const STOP_LIMIT_OFFSET = 0.995;

const stopPrefix = (clientPrefix: string, symbol: string) => `${clientPrefix}${symbol}-`;
const qtyKey = (qty: number) => qty.toFixed(6).replace(/\.?0+$/, '');
const roundQty = (x: number) => Math.round(x * 1e9) / 1e9;
const remainingOf = (x: AlpacaOrderLike) => roundQty(Number(x.qty) - Number(x.filled_qty ?? 0));

/**
 * Uniek per proces én over processen heen: Alpaca weigert een hergebruikte client_order_id,
 * ook van een geannuleerde order. Een teller in geheugen begint elke cron-run weer bij 1.
 */
let seq = 0;
export function stopClientOrderId(clientPrefix: string, symbol: string, stopPx: number, qty: number, now = Date.now()): string {
  seq = (seq + 1) % 1296;
  return `${stopPrefix(clientPrefix, symbol)}${qtyKey(qty)}-${Math.round(stopPx * 100)}-${now.toString(36)}${seq.toString(36)}`;
}

export function stopLimitPrice(stopPx: number): number {
  const limit = +(stopPx * STOP_LIMIT_OFFSET).toFixed(2);
  if (!(limit > 0) || limit >= stopPx) throw new Error(`ongeldige stop_limit: stop ${stopPx}, limiet ${limit}`);
  return limit;
}

export function momentumMarketTimeInForce(symbol: string): 'gtc' | 'day' {
  return isCryptoSymbol(symbol) ? 'gtc' : 'day';
}

function fillOf(cur: AlpacaOrderLike): Fill | null {
  const filledQty = Number(cur.filled_qty ?? 0);
  if (!(filledQty > 0)) return null;
  const px = Number(cur.filled_avg_price);
  if (!Number.isFinite(px) || px <= 0) return null;
  return { orderId: cur.id, qty: filledQty, price: px, done: TERMINAL.has(cur.status) };
}

const worse = (a: CancelStopOutcome, b: AwaitCancelOutcome): CancelStopOutcome => {
  const rank: Record<CancelStopOutcome, number> = { none: 0, canceled: 1, timeout: 2, failed: 3, filled: 4 };
  return rank[b] > rank[a] ? b : a;
};

/**
 * Alpaca PAPER-broker voor Momentum 5/6.
 * Regels die Alpaca afdwingt en waar dit op gebouwd is:
 *  - een positie is account-breed; meerdere sleeves delen hem;
 *  - een open sell (ook de eigen GTC-stop) reserveert stukken: qty_available daalt;
 *  - partially_filled is een open status, filled_qty is cumulatief;
 *  - een client_order_id mag nooit twee keer.
 */
export function makeAlpacaPaperBroker(
  client: AlpacaPaperClient,
  opts: { sleep?: (ms: number) => Promise<void>; pollAttempts?: number; cancelDelayMs?: number } = {},
): MomentumBroker {
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const pollAttempts = opts.pollAttempts ?? 15;
  const cancelDeps = {
    getOrder: (id: string) => client.getOrder(id),
    cancelOrder: (id: string) => client.cancelOrder(id),
    sleep,
    delayMs: opts.cancelDelayMs,
  };

  const ownStops = async (prefix: string, symbol: string) =>
    (await client.openOrders(200)).filter(
      (x) =>
        x.side === 'sell' &&
        x.client_order_id?.startsWith(stopPrefix(prefix, symbol)) &&
        OPEN_STATUSES.has(x.status) &&
        alpacaSymbolsEqual(x.symbol, symbol),
    );

  async function pollFill(order: AlpacaOrderLike): Promise<Fill | null> {
    let cur = order;
    for (let i = 0; i < pollAttempts; i++) {
      if (TERMINAL.has(cur.status)) return fillOf(cur);
      await sleep(1000);
      cur = await client.getOrder(cur.id);
    }
    // nog open: geef de partial terug met done=false, het boek volgt de rest via orderFill
    return fillOf(cur);
  }

  async function placeStop(symbol: string, qty: number, stopPx: number, prefix: string) {
    const clientOrderId = stopClientOrderId(prefix, symbol, stopPx, qty);
    if (isCryptoSymbol(symbol)) {
      return client.placeOrder({
        symbol, qty, side: 'sell', type: 'stop_limit', time_in_force: 'gtc',
        stop_price: stopPx, limit_price: stopLimitPrice(stopPx), client_order_id: clientOrderId,
      });
    }
    return client.placeOrder({
      symbol, qty, side: 'sell', type: 'stop', time_in_force: 'gtc', stop_price: stopPx, client_order_id: clientOrderId,
    });
  }

  async function cancelAll(orders: AlpacaOrderLike[]): Promise<CancelStopOutcome> {
    let out: CancelStopOutcome = 'none';
    for (const x of orders) out = worse(out, await awaitStopOrderCanceled(x.id, cancelDeps));
    return out;
  }

  const stopFills: NonNullable<MomentumBroker['stopFills']> = async (o) => {
    const prefix = stopPrefix(o.stopClientPrefix, o.symbol);
    const since = o.since.slice(0, 10);
    return (await client.orders(500))
      .filter(
        (x) =>
          x.client_order_id?.startsWith(prefix) &&
          alpacaSymbolsEqual(x.symbol, o.symbol) &&
          !!x.filled_at &&
          x.filled_at.slice(0, 10) >= since &&
          Number(x.filled_qty) > 0,
      )
      .sort((a, b) => (a.filled_at! < b.filled_at! ? -1 : 1))
      .map(fillOf)
      .filter((f): f is Fill => !!f);
  };

  return {
    async marketOrder(o) {
      let placed: AlpacaOrderLike;
      try {
        placed = await client.placeOrder({
          symbol: o.symbol, qty: o.qty, side: o.side, type: 'market',
          time_in_force: momentumMarketTimeInForce(o.symbol), client_order_id: o.clientOrderId,
        });
      } catch (e) {
        // dubbele client_order_id: dezelfde order bestaat al (herstart, retry); volg die
        if (alpacaHttpStatusFromError(e) !== 422) throw e;
        const existing = await client.getOrderByClientOrderId(o.clientOrderId);
        if (!existing) throw e;
        placed = existing;
      }
      return pollFill(placed);
    },

    async orderFill(o) {
      return fillOf(await client.getOrder(o.orderId));
    },

    /**
     * Eén stop per sleeve en symbool, op `qty` en minstens het huidige niveau.
     * Bestaat er al een, dan replace (PATCH): plaats-dan-cancel faalt met 403 omdat de oude stop
     * de stukken nog vasthoudt. Extra stops gaan eerst weg zodat de replace de stukken vrij heeft.
     */
    async setStop(o) {
      const open = await ownStops(o.stopClientPrefix, o.symbol);
      if (!open.length) {
        await placeStop(o.symbol, o.qty, o.stopPrice, o.stopClientPrefix);
        return;
      }
      open.sort((a, b) => Number(b.stop_price ?? 0) - Number(a.stop_price ?? 0));
      const [cur, ...extra] = open;
      if (extra.length) {
        const r = await cancelAll(extra);
        if (r === 'filled') throw new Error(`stop ${o.symbol} vulde tijdens opruimen; boek eerst bijwerken`);
        if (r !== 'canceled' && r !== 'none') throw new Error(`extra stop ${o.symbol} niet geannuleerd (${r})`);
      }
      const curStop = Number(cur!.stop_price ?? 0);
      const stopPx = Math.max(o.stopPrice, curStop);
      if (remainingOf(cur!) === roundQty(o.qty) && curStop >= stopPx - 1e-6) return;

      if (cur!.status === 'partially_filled') {
        // replace van een deels gevulde order is niet eenduidig: annuleer, bevestig, plaats nieuw
        const r = await awaitStopOrderCanceled(cur!.id, cancelDeps);
        if (r === 'filled') throw new Error(`stop ${o.symbol} vulde tijdens vervangen; boek eerst bijwerken`);
        if (r !== 'canceled') throw new Error(`stop ${o.symbol} niet geannuleerd (${r})`);
        await placeStop(o.symbol, o.qty, stopPx, o.stopClientPrefix);
        return;
      }

      await client.replaceOrder(cur!.id, {
        qty: o.qty,
        stop_price: stopPx,
        ...(isCryptoSymbol(o.symbol) ? { limit_price: stopLimitPrice(stopPx) } : {}),
        client_order_id: stopClientOrderId(o.stopClientPrefix, o.symbol, stopPx, o.qty),
      });
    },

    async listOpenStops(o) {
      return (await client.openOrders(200))
        .filter((x) => x.client_order_id?.startsWith(o.stopClientPrefix) && OPEN_STATUSES.has(x.status) && x.side === 'sell')
        .map((x) => ({
          symbol: x.symbol,
          qty: remainingOf(x),
          stopPrice: Number(x.stop_price ?? 0),
          clientOrderId: x.client_order_id ?? '',
          orderId: x.id,
        }))
        .filter((x) => x.stopPrice > 0 && x.qty > 0);
    },

    async cancelStop(o) {
      if (o.orderId) return awaitStopOrderCanceled(o.orderId, cancelDeps);
      const prefix = o.stopClientPrefix ?? `m2s-${o.versionId}-`;
      return cancelAll(await ownStops(prefix, o.symbol));
    },

    stopFills,

    async stopFill(o) {
      return (await stopFills(o)).at(-1) ?? null;
    },

    /** Account-brede qty (niet qty_available). */
    async positionQty(o) {
      const pos = (await client.positions()).find((p) => alpacaSymbolsEqual(p.symbol, o.symbol));
      if (!pos) return 0;
      const q = parseFloat(pos.qty);
      return Number.isFinite(q) ? q : null;
    },
  };
}
