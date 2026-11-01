import { AlpacaHttpError } from '../../alpaca/alpaca-http-error';
import { alpacaSymbolsEqual } from '../../alpaca/symbol-path';
import type { AlpacaOrderLike, AlpacaPaperClient } from '../alpaca-paper-broker';

/**
 * Nep-Alpaca (paper) met de regels waar PR 47 op stukliep:
 *  - posities zijn account-breed (meerdere sleeves + M1 delen één positie);
 *  - elke open sell (ook een GTC-stop) reserveert stukken: qty_available = qty - open sells;
 *    een sell boven qty_available geeft 403 "insufficient qty available";
 *  - partially_filled is zichtbaar en open, filled_qty is cumulatief;
 *  - een client_order_id mag nooit twee keer (ook niet na cancel) -> 422;
 *  - replace (PATCH) maakt een nieuwe order, de oude gaat naar 'replaced'; niet in accepted/pending_*,
 *    en qty alleen in hele stukken;
 *  - een cancel kan een tijd in pending_cancel blijven (en blijft dan reserveren);
 *  - GET /orders kan tijdelijk 503 geven;
 *  - crypto: de fee gaat van de ontvangen coin af (positie < filled_qty).
 */
type Order = AlpacaOrderLike & { limit_price: string | null };

const OPEN = new Set(['new', 'accepted', 'held', 'pending_new', 'partially_filled', 'pending_cancel', 'pending_replace']);
const NO_PATCH = new Set(['accepted', 'pending_new', 'pending_cancel', 'pending_replace']);
const r9 = (x: number) => Math.round(x * 1e9) / 1e9;

export class FakeAlpaca implements AlpacaPaperClient {
  orders_: Order[] = [];
  pos: Record<string, number> = {};
  prices: Record<string, number> = {};
  today = '2024-06-03';
  /** Volgende market orders vullen maar voor deze fractie (daarna blijft de rest open of wordt gecanceld). */
  marketFillRatio = 1;
  marketRestCanceled = false;
  /** Stops plaatsen of vervangen faalt (bijv. broker-storing). */
  failStops = false;
  /** Zoveel GET-polls blijft een geannuleerde order in pending_cancel. */
  cancelHangPolls = 0;
  /** Status van nieuw geplaatste stops (bijv. 'accepted' buiten de sessie). */
  stopStatus = 'new';
  /** Zoveel volgende GET /orders/{id} geven 503. */
  getFails = 0;
  /** Crypto-fee als fractie van de ontvangen coin. */
  cryptoFee = 0;
  calls: string[] = [];
  private hang: Record<string, number> = {};
  private seq = 0;
  private usedClientIds = new Set<string>();

  private key(symbol: string): string {
    return Object.keys(this.pos).find((s) => alpacaSymbolsEqual(s, symbol)) ?? symbol;
  }

  reserved(symbol: string, exceptId?: string): number {
    return r9(
      this.orders_
        .filter((o) => o.side === 'sell' && OPEN.has(o.status) && alpacaSymbolsEqual(o.symbol, symbol) && o.id !== exceptId)
        .reduce((s, o) => s + Number(o.qty) - Number(o.filled_qty), 0),
    );
  }

  available(symbol: string, exceptId?: string): number {
    return r9((this.pos[this.key(symbol)] ?? 0) - this.reserved(symbol, exceptId));
  }

  /** Stops die de positie echt beschermen (pending_cancel telt niet). */
  openStops(symbol?: string): Order[] {
    return this.orders_.filter(
      (o) =>
        o.side === 'sell' && o.type !== 'market' && OPEN.has(o.status) && o.status !== 'pending_cancel' &&
        (!symbol || alpacaSymbolsEqual(o.symbol, symbol)),
    );
  }
  /** Alle hangende cancels gaan alsnog door (de tijd verstrijkt). */
  settle() {
    for (const o of this.orders_) if (o.status === 'pending_cancel') o.status = 'canceled';
  }

  private err(method: 'POST' | 'PATCH' | 'DELETE', status: number, body: string): never {
    throw new AlpacaHttpError(method, 'https://paper-api.alpaca.markets/v2/orders', status, body);
  }

  private claimClientId(method: 'POST' | 'PATCH', id: string | undefined) {
    if (!id) return;
    if (this.usedClientIds.has(id)) this.err(method, 422, '{"message":"client_order_id must be unique"}');
    this.usedClientIds.add(id);
  }

  private fill(o: Order, qty: number, price: number) {
    const k = this.key(o.symbol);
    const filled = r9(Number(o.filled_qty) + qty);
    const prevPx = Number(o.filled_avg_price ?? 0);
    o.filled_avg_price = String((prevPx * Number(o.filled_qty) + price * qty) / filled);
    o.filled_qty = String(filled);
    o.filled_at = `${this.today}T15:00:00Z`;
    o.status = filled >= Number(o.qty) - 1e-12 ? 'filled' : 'partially_filled';
    const recv = o.side === 'buy' && o.symbol.includes('/') ? qty * (1 - this.cryptoFee) : qty;
    this.pos[k] = r9((this.pos[k] ?? 0) + (o.side === 'buy' ? recv : -qty));
    if (this.pos[k]! <= 1e-12) delete this.pos[k];
  }

  async placeOrder(o: Parameters<AlpacaPaperClient['placeOrder']>[0]): Promise<Order> {
    this.calls.push(`place ${o.type} ${o.side} ${o.symbol} ${o.qty}`);
    if (o.type !== 'market' && this.failStops) this.err('POST', 500, '{"message":"internal error"}');
    if (o.side === 'sell' && o.qty > this.available(o.symbol) + 1e-12) {
      this.err('POST', 403, `{"message":"insufficient qty available for order (requested: ${o.qty}, available: ${this.available(o.symbol)})"}`);
    }
    this.claimClientId('POST', o.client_order_id);
    const order: Order = {
      id: `ord-${++this.seq}`,
      client_order_id: o.client_order_id,
      symbol: o.symbol,
      side: o.side,
      qty: String(o.qty),
      filled_qty: '0',
      type: o.type,
      status: o.type === 'market' ? 'new' : this.stopStatus,
      filled_at: null,
      filled_avg_price: null,
      stop_price: o.stop_price != null ? String(o.stop_price) : null,
      limit_price: o.limit_price != null ? String(o.limit_price) : null,
    };
    this.orders_.push(order);
    if (o.type === 'market') {
      const px = this.prices[o.symbol] ?? 100;
      const q = r9(o.qty * this.marketFillRatio);
      if (q > 0) this.fill(order, q, px);
      if (order.status !== 'filled' && this.marketRestCanceled) order.status = 'canceled';
    }
    return { ...order };
  }

  async replaceOrder(id: string, o: Parameters<AlpacaPaperClient['replaceOrder']>[1]): Promise<Order> {
    this.calls.push(`replace ${id} qty=${o.qty} stop=${o.stop_price}`);
    if (this.failStops) this.err('PATCH', 500, '{"message":"internal error"}');
    const cur = this.orders_.find((x) => x.id === id);
    if (!cur || !OPEN.has(cur.status) || NO_PATCH.has(cur.status)) {
      this.err('PATCH', 422, `{"message":"order not replaceable (${cur?.status})"}`);
    }
    if (o.qty != null && !Number.isInteger(o.qty)) this.err('PATCH', 422, '{"message":"qty must be whole shares"}');
    const qty = o.qty ?? Number(cur.qty);
    if (cur.side === 'sell' && qty > this.available(cur.symbol, cur.id) + 1e-12) {
      this.err('PATCH', 403, '{"message":"insufficient qty available for order"}');
    }
    this.claimClientId('PATCH', o.client_order_id);
    cur.status = 'replaced';
    const next: Order = {
      ...cur,
      id: `ord-${++this.seq}`,
      client_order_id: o.client_order_id ?? cur.client_order_id,
      qty: String(qty),
      filled_qty: '0',
      filled_at: null,
      filled_avg_price: null,
      status: 'new',
      stop_price: o.stop_price != null ? String(o.stop_price) : cur.stop_price,
      limit_price: o.limit_price != null ? String(o.limit_price) : cur.limit_price,
    };
    this.orders_.push(next);
    return { ...next };
  }

  async openOrders(): Promise<Order[]> {
    return this.orders_.filter((o) => OPEN.has(o.status)).map((o) => ({ ...o }));
  }

  async orders(): Promise<Order[]> {
    return [...this.orders_].reverse().map((o) => ({ ...o }));
  }

  async getOrder(id: string): Promise<Order> {
    if (this.getFails > 0) {
      this.getFails -= 1;
      throw new AlpacaHttpError('GET', `https://paper-api.alpaca.markets/v2/orders/${id}`, 503, 'service unavailable');
    }
    const o = this.orders_.find((x) => x.id === id);
    if (!o) throw new AlpacaHttpError('GET', `https://paper-api.alpaca.markets/v2/orders/${id}`, 404, 'not found');
    if (o.status === 'pending_cancel') {
      this.hang[o.id] = (this.hang[o.id] ?? 0) - 1;
      if (this.hang[o.id]! <= 0) o.status = 'canceled';
    }
    return { ...o };
  }

  async getOrderByClientOrderId(cid: string): Promise<Order | null> {
    const o = this.orders_.find((x) => x.client_order_id === cid);
    return o ? { ...o } : null;
  }

  async cancelOrder(id: string): Promise<unknown> {
    this.calls.push(`cancel ${id}`);
    const o = this.orders_.find((x) => x.id === id);
    if (!o || !OPEN.has(o.status) || o.status === 'pending_cancel') this.err('DELETE', 422, '{"message":"order is not cancelable"}');
    if (this.cancelHangPolls > 0) {
      o.status = 'pending_cancel';
      this.hang[o.id] = this.cancelHangPolls;
    } else {
      o.status = 'canceled';
    }
    return {};
  }

  async positions() {
    return Object.entries(this.pos).map(([symbol, qty]) => ({
      symbol,
      qty: String(qty),
      qty_available: String(this.available(symbol)),
    }));
  }

  // ── testhulpen ──
  /** Positie die al bestaat (bijv. van M1 of een eerdere run). */
  seedPosition(symbol: string, qty: number) {
    this.pos[symbol] = r9((this.pos[symbol] ?? 0) + qty);
  }
  /** Laat een open stop (deels) vullen. */
  triggerStop(symbol: string, qty: number, price: number) {
    const o = this.openStops(symbol)[0];
    if (!o) throw new Error(`geen open stop voor ${symbol}`);
    this.fill(o, Math.min(qty, Number(o.qty) - Number(o.filled_qty)), price);
  }
  /** Rest van open market orders vullen. */
  fillOpenMarkets(price?: number) {
    for (const o of this.orders_.filter((x) => x.type === 'market' && OPEN.has(x.status))) {
      this.fill(o, Number(o.qty) - Number(o.filled_qty), price ?? this.prices[o.symbol] ?? 100);
    }
  }
}
