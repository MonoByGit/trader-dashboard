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
  /** Orders van één symbool sinds `after` (ISO), alle statussen. Valt terug op orders(500). */
  ordersFor?(o: { symbol: string; after: string }): Promise<AlpacaOrderLike[]>;
  getOrder(id: string): Promise<AlpacaOrderLike>;
  getOrderByClientOrderId(clientOrderId: string): Promise<AlpacaOrderLike | null>;
  cancelOrder(id: string): Promise<unknown>;
  positions(): Promise<AlpacaPositionLike[]>;
}

/** Een stop in deze statussen beschermt (nog) de positie. */
export const OPEN_STATUSES = new Set(['new', 'accepted', 'held', 'pending_new', 'partially_filled', 'pending_replace']);
/** Overgangsstatussen: niet aanraken (geen PATCH, geen cancel), wel meetellen als reservering. */
const TRANSITIONAL = new Set(['pending_new', 'pending_replace', 'pending_cancel', 'accepted']);
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

/**
 * Stand van een market order: terminaal zonder fill = null (zeker niet uitgevoerd);
 * nog open zonder fill = qty 0, done false (het boek volgt hem via openOrders).
 */
function marketStateOf(cur: AlpacaOrderLike): Fill | null {
  const f = fillOf(cur);
  if (f) return f;
  if (TERMINAL.has(cur.status)) return null;
  return { orderId: cur.id, qty: 0, price: 0, done: false };
}

/** Standaard wachtbudget per broker (per strategie-run binnen een tick). */
export const DEFAULT_WAIT_BUDGET_MS = 45_000;

/** Marker voor een order waarvan we niet weten of hij geplaatst is: volg hem via zijn client_order_id. */
const UNKNOWN_PREFIX = 'cid:';

/** Tijdelijke fout (netwerk, timeout, 429, 5xx): de status is onbekend, niet 'mislukt'. */
export function isTransientAlpacaError(e: unknown): boolean {
  const st = alpacaHttpStatusFromError(e);
  if (st === null) return true; // geen HTTP-antwoord: netwerk of timeout
  return st === 429 || st >= 500;
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
  opts: {
    sleep?: (ms: number) => Promise<void>;
    pollAttempts?: number;
    cancelDelayMs?: number;
    /** Zo lang (pogingen x cancelDelayMs) wachten we op een bevestigde cancel; Alpaca kan tientallen seconden in pending_cancel blijven. */
    cancelAttempts?: number;
    /**
     * Totale wachttijd (ms) voor deze broker, over alle cancels en fill-polls samen. De run draait binnen
     * één tick-request: is het budget op, dan geldt een cancel als 'timeout' (exit wacht, stop blijft)
     * en een market order als 'loopt nog' (volgen via openOrders). Nooit een positie zonder stop.
     */
    waitBudgetMs?: number;
    log?: (line: string) => void;
  } = {},
): MomentumBroker {
  const rawSleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const budget = opts.waitBudgetMs ?? DEFAULT_WAIT_BUDGET_MS;
  let waited = 0;
  const budgetLeft = () => budget - waited;
  const sleep = async (ms: number) => {
    waited += ms;
    await rawSleep(ms);
  };
  const pollAttempts = opts.pollAttempts ?? 15;
  const log = opts.log ?? ((l: string) => console.warn(l));

  /** GET met tijdelijke fouten als 'nog onbekend' in plaats van een exception. */
  const getOrderSafe = async (id: string): Promise<AlpacaOrderLike | null> => {
    try {
      return await client.getOrder(id);
    } catch (e) {
      if (isTransientAlpacaError(e)) return null;
      throw e;
    }
  };

  const cancelDelayMs = opts.cancelDelayMs ?? 500;
  const cancelAttempts = opts.cancelAttempts ?? 120;
  const baseCancelDeps = {
    getOrder: async (id: string) => (await getOrderSafe(id)) ?? { status: 'unknown' },
    cancelOrder: (id: string) => client.cancelOrder(id),
    sleep,
    delayMs: cancelDelayMs,
  };
  /** Pogingen begrensd door het resterende wachtbudget; minstens één GET, dus nooit blind 'canceled'. */
  const awaitCancel = (id: string) =>
    awaitStopOrderCanceled(id, {
      ...baseCancelDeps,
      attempts: Math.max(1, Math.min(cancelAttempts, Math.floor(Math.max(0, budgetLeft()) / cancelDelayMs) + 1)),
    });

  const ownOrders = async (prefix: string, symbol: string, statuses: Set<string>) =>
    (await client.openOrders(200)).filter(
      (x) =>
        x.side === 'sell' &&
        x.client_order_id?.startsWith(stopPrefix(prefix, symbol)) &&
        statuses.has(x.status) &&
        alpacaSymbolsEqual(x.symbol, symbol),
    );
  const ownStops = (prefix: string, symbol: string) => ownOrders(prefix, symbol, OPEN_STATUSES);

  /** Wacht een market order uit. Tijdelijke GET-fouten = blijven pollen; aan het eind onbekend = done false. */
  async function pollFill(order: AlpacaOrderLike): Promise<Fill | null> {
    let cur: AlpacaOrderLike = order;
    for (let i = 0; i < pollAttempts; i++) {
      if (TERMINAL.has(cur.status)) return marketStateOf(cur);
      if (budgetLeft() < 1000) break; // budget op: 'loopt nog', het boek volgt hem
      await sleep(1000);
      cur = (await getOrderSafe(cur.id)) ?? cur;
    }
    return marketStateOf(cur);
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
    for (const x of orders) out = worse(out, await awaitCancel(x.id));
    return out;
  }

  /** Stop vervangen door annuleren (bevestigd) en opnieuw plaatsen. Alleen als PATCH niet kan. */
  async function cancelAndPlace(cur: AlpacaOrderLike, symbol: string, qty: number, stopPx: number, prefix: string) {
    const r = await awaitCancel(cur.id);
    if (r === 'filled') throw new Error(`stop ${symbol} vulde tijdens vervangen; boek eerst bijwerken`);
    if (r !== 'canceled') throw new Error(`stop ${symbol} niet bevestigd geannuleerd (${r}); oude stop blijft`);
    await placeStop(symbol, qty, stopPx, prefix);
  }

  const stopFills: NonNullable<MomentumBroker['stopFills']> = async (o) => {
    const prefix = stopPrefix(o.stopClientPrefix, o.symbol);
    const since = o.since.slice(0, 10);
    const orders = client.ordersFor
      ? await client.ordersFor({ symbol: o.symbol, after: `${since}T00:00:00Z` })
      : await client.orders(500);
    return orders
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

  const accountQty = async (symbol: string): Promise<number | null> => {
    try {
      const pos = (await client.positions()).find((p) => alpacaSymbolsEqual(p.symbol, symbol));
      if (!pos) return 0;
      const q = parseFloat(pos.qty);
      return Number.isFinite(q) ? q : null;
    } catch (e) {
      if (isTransientAlpacaError(e)) return null;
      throw e;
    }
  };

  return {
    /**
     * Market order. Nooit 'mislukt' melden als de order misschien toch bij Alpaca staat:
     *  - geplaatst maar status onbekend: { qty 0, done false } en het boek volgt hem;
     *  - plaatsen gaf een tijdelijke fout: opzoeken op client_order_id, anders marker 'cid:';
     *  - alleen een definitieve weigering (4xx) gooit door: dan is er zeker niets geplaatst.
     * Crypto: Alpaca houdt de fee in op de ontvangen coin; `received` is wat er echt binnenkwam.
     */
    async marketOrder(o) {
      const before = o.side === 'buy' && isCryptoSymbol(o.symbol) ? await accountQty(o.symbol) : null;
      let placed: AlpacaOrderLike;
      try {
        placed = await client.placeOrder({
          symbol: o.symbol, qty: o.qty, side: o.side, type: 'market',
          time_in_force: momentumMarketTimeInForce(o.symbol), client_order_id: o.clientOrderId,
        });
      } catch (e) {
        const st = alpacaHttpStatusFromError(e);
        if (st === 422 || isTransientAlpacaError(e)) {
          let existing: AlpacaOrderLike | null = null;
          try {
            existing = await client.getOrderByClientOrderId(o.clientOrderId);
          } catch (e2) {
            if (!isTransientAlpacaError(e2)) throw e2;
            log(`[momentum-broker] ${o.symbol} ${o.side}: status onbekend na ${String(e)}; volgen via client_order_id`);
            return { orderId: `${UNKNOWN_PREFIX}${o.clientOrderId}`, qty: 0, price: 0, done: false };
          }
          if (!existing) {
            // Een time-out of 5xx zegt niet dat er niets geplaatst is, en een 422 op client_order_id zegt dat hij
            // er wel is: Alpaca toont een net geplaatste order niet altijd meteen. Volgen, nooit opnieuw plaatsen.
            log(`[momentum-broker] ${o.symbol} ${o.side}: order (nog) niet zichtbaar na ${String(e)}; volgen via client_order_id`);
            return { orderId: `${UNKNOWN_PREFIX}${o.clientOrderId}`, qty: 0, price: 0, done: false };
          }
          if (st === 422) log(`[momentum-broker] ${o.symbol} ${o.side}: 422 bij plaatsen, bestaande order gevolgd: ${String(e)}`);
          placed = existing;
        } else {
          throw e;
        }
      }
      const f = await pollFill(placed);
      if (f && before != null && f.qty > 0 && f.done !== false) {
        const after = await accountQty(o.symbol);
        if (after != null) {
          const got = roundQty(after - before);
          if (got > 0 && got <= f.qty + 1e-12) return { ...f, received: got };
        }
      }
      return f;
    },

    async orderFill(o) {
      if (o.orderId.startsWith(UNKNOWN_PREFIX)) {
        const cid = o.orderId.slice(UNKNOWN_PREFIX.length);
        const cur = await client.getOrderByClientOrderId(cid);
        // niet (meer) te vinden: het intent mag opnieuw, met dezelfde client_order_id (Alpaca weigert dan een dubbele)
        if (!cur) return { orderId: o.orderId, qty: 0, price: 0, done: true, missing: true, clientOrderId: cid };
        return marketStateOf(cur);
      }
      return marketStateOf(await client.getOrder(o.orderId));
    },

    /**
     * Eén stop per sleeve en symbool, op `qty` en minstens het huidige niveau. Nooit een moment zonder stop:
     *  - stop in overgang (pending_*, accepted): niet aanraken, hij beschermt nog;
     *  - prijs omhoog bij gelijke qty: PATCH zonder qty (Alpaca: qty-PATCH alleen hele stukken);
     *  - qty anders: PATCH met qty bij hele stukken, anders annuleren (bevestigd) en opnieuw plaatsen;
     *  - PATCH geweigerd (422): annuleren (bevestigd) en opnieuw plaatsen; niet bevestigd = oude blijft.
     */
    async setStop(o) {
      const all = await ownOrders(o.stopClientPrefix, o.symbol, new Set(Array.from(OPEN_STATUSES).concat('pending_cancel')));
      // een cancel die nog loopt eerst uitwachten: die stukken zitten nog vast
      for (const x of all.filter((y) => y.status === 'pending_cancel')) {
        const r = await awaitCancel(x.id);
        if (r === 'filled') throw new Error(`stop ${o.symbol} vulde tijdens annuleren; boek eerst bijwerken`);
        if (r !== 'canceled') throw new Error(`cancel van stop ${o.symbol} loopt nog (${r})`);
      }
      const open = all.filter((x) => x.status !== 'pending_cancel');
      if (!open.length) {
        await placeStop(o.symbol, o.qty, o.stopPrice, o.stopClientPrefix);
        return;
      }
      open.sort((a, b) => Number(b.stop_price ?? 0) - Number(a.stop_price ?? 0));
      const [cur, ...extra] = open;
      if (open.some((x) => x.status === 'pending_replace' || x.status === 'pending_new')) return; // in overgang: volgende run
      if (extra.length) {
        const r = await cancelAll(extra);
        if (r === 'filled') throw new Error(`stop ${o.symbol} vulde tijdens opruimen; boek eerst bijwerken`);
        if (r !== 'canceled' && r !== 'none') throw new Error(`extra stop ${o.symbol} niet geannuleerd (${r})`);
      }
      const curStop = Number(cur!.stop_price ?? 0);
      const stopPx = Math.max(o.stopPrice, curStop);
      const qtyChange = remainingOf(cur!) !== roundQty(o.qty);
      if (!qtyChange && curStop >= stopPx - 1e-6) return;

      const wholeQty = Number.isInteger(o.qty) && Number.isInteger(Number(cur!.qty));
      if (cur!.status === 'partially_filled' || TRANSITIONAL.has(cur!.status) || (qtyChange && !wholeQty)) {
        await cancelAndPlace(cur!, o.symbol, o.qty, stopPx, o.stopClientPrefix);
        return;
      }
      try {
        await client.replaceOrder(cur!.id, {
          ...(qtyChange ? { qty: o.qty } : {}),
          stop_price: stopPx,
          ...(isCryptoSymbol(o.symbol) ? { limit_price: stopLimitPrice(stopPx) } : {}),
          client_order_id: stopClientOrderId(o.stopClientPrefix, o.symbol, stopPx, o.qty),
        });
      } catch (e) {
        if (alpacaHttpStatusFromError(e) !== 422) throw e;
        log(`[momentum-broker] PATCH stop ${o.symbol} geweigerd, annuleren en opnieuw plaatsen: ${String(e)}`);
        await cancelAndPlace(cur!, o.symbol, o.qty, stopPx, o.stopClientPrefix);
      }
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
          status: x.status,
        }))
        .filter((x) => x.stopPrice > 0 && x.qty > 0);
    },

    async cancelStop(o) {
      if (o.orderId) return awaitCancel(o.orderId);
      const prefix = o.stopClientPrefix ?? `m2s-${o.versionId}-`;
      return cancelAll(await ownOrders(prefix, o.symbol, new Set(Array.from(OPEN_STATUSES).concat('pending_cancel'))));
    },

    stopFills,

    async stopFill(o) {
      return (await stopFills(o)).at(-1) ?? null;
    },

    /** Account-brede qty (niet qty_available). */
    async positionQty(o) {
      return accountQty(o.symbol);
    },
  };
}
