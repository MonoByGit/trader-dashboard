import { applyBuy, applySell, equityOf, logRow, newBook } from './book';
import type { MomentumBroker, SetStopRequest } from './broker-types';
import { dateOf } from './indicators';
import { rotationHooks, type StrategyHooks } from './hooks';
import { momentumClientOrderId, momentumStopClientPrefix } from './order-tag';
import { checkStopLevel, lossLimitBreached } from './risk';
import type {
  Bar, EquityLogRow, OrderIntent, TradeLogRow, VersionBook, VersionConfig, VetoFn, VetoVerdict,
} from './types';

/**
 * Live (papier) orkestratie. Twee stappen per handelsdag:
 *  - decideDay  na de close: waardeert, logt versus SPY, controleert de verliesgrens en plant de orders.
 *  - executeDay bij de open: verwerkt gevulde stops, voert de geplande orders uit en zet/verhoogt de stops.
 * Alles loopt via Broker en Store, zodat de logica zonder netwerk te testen is.
 */
export interface Fill {
  orderId: string;
  /** Cumulatieve gevulde qty van deze order. */
  qty: number;
  price: number;
  /** false = order staat nog open of de status is (nog) onbekend; undefined/true = terminaal. */
  done?: boolean;
  /** Crypto-buy: wat er echt binnenkwam (fee gaat van de coin af), cumulatief zoals qty. */
  received?: number;
}

/** @deprecated alias */
export type Broker = MomentumBroker;

export interface DecisionRecord {
  date: string;
  versionId: string;
  kind: 'rebalance' | 'halt' | 'veto' | 'stop' | 'skip';
  symbol?: string;
  detail: string;
  veto?: VetoVerdict;
}

export interface Store {
  loadBook(versionId: string): Promise<VersionBook | null>;
  saveBook(book: VersionBook): Promise<void>;
  loadPending(versionId: string): Promise<OrderIntent[]>;
  savePending(versionId: string, orders: OrderIntent[]): Promise<void>;
  logEquity(versionId: string, row: EquityLogRow): Promise<void>;
  logTrade(versionId: string, row: TradeLogRow): Promise<void>;
  logDecision(rec: DecisionRecord): Promise<void>;
}

type OpenOrderMeta = NonNullable<VersionBook['openOrders']>[string];

/** Qty van `symbol` in de echte boeken van ANDERE sleeves (M1 telt niet: die heeft geen boek). */
export type ForeignQtyFn = (symbol: string, excludeVersionId: string) => Promise<number>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const roundQty = (x: number) => Math.round(x * 1e9) / 1e9;
const MAX_FILLS_TRACKED = 200;

/**
 * Qty die deze sleeve bij de broker mag verkopen of afdekken.
 * Account-qty (niet qty_available: de eigen stop reserveert stukken) min de boeken van andere sleeves,
 * met het eigen boek als bovengrens. Het boek wordt hier nooit overschreven.
 */
export async function sleeveQty(
  broker: MomentumBroker,
  book: VersionBook,
  symbol: string,
  foreignQty?: ForeignQtyFn,
): Promise<number> {
  const own = book.positions[symbol]?.qty ?? 0;
  if (own <= 0) return 0;
  if (!book.real || !broker.positionQty) return own;
  const acct = await broker.positionQty({ symbol });
  if (acct == null || !Number.isFinite(acct)) return own;
  const others = foreignQty ? Math.max(0, await foreignQty(symbol, book.versionId)) : 0;
  return Math.max(0, roundQty(Math.min(own, acct - others)));
}

/** Nieuw deel van een cumulatieve fill dat nog niet in het boek staat. */
function fillDelta(book: VersionBook, f: Fill): number {
  const applied = book.fillsApplied?.[f.orderId] ?? 0;
  return Math.max(0, roundQty(f.qty - applied));
}

function markApplied(book: VersionBook, f: Fill): void {
  const m = (book.fillsApplied ??= {});
  m[f.orderId] = Math.max(m[f.orderId] ?? 0, f.qty);
  const keys = Object.keys(m);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_FILLS_TRACKED))) delete m[k];
}

async function setStopWithRetry(broker: MomentumBroker, req: SetStopRequest, attempts = 3): Promise<void> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      await broker.setStop(req);
      return;
    } catch (e) {
      last = e;
      if (i < attempts - 1) await sleep(400);
    }
  }
  throw last;
}

async function placeDisasterStop(input: {
  broker: MomentumBroker;
  book: VersionBook;
  cfg: VersionConfig;
  sym: string;
  hooks: StrategyHooks;
  stopPx: string;
  bars?: Bar[];
  foreignQty?: ForeignQtyFn;
}): Promise<void> {
  const { broker, book, cfg, sym, hooks, stopPx, bars: hist } = input;
  const pos = book.positions[sym];
  if (!pos) return;
  const st = hooks.stopFor(pos, cfg, hist?.length ? hist : undefined, sym);
  if (!Number.isFinite(st.level) || st.level <= 0) return;
  const qty = await sleeveQty(broker, book, sym, input.foreignQty);
  if (qty <= 0) {
    if (book.real) throw new Error(`geen broker-qty voor ${sym} in boek ${book.versionId}`);
    return;
  }
  await setStopWithRetry(broker, {
    versionId: cfg.id,
    symbol: sym,
    qty,
    stopPrice: round2(st.level),
    stopClientPrefix: stopPx,
  });
}

function bookKindMismatch(book: VersionBook | null, expectReal: boolean | undefined): string | null {
  if (expectReal === undefined) return null;
  if (expectReal && !book?.real) return 'papiermodus zonder papierboek: niets gedaan';
  if (!expectReal && book?.real) return 'schaduwmodus met een papierboek: schaduw schrijft nooit in het papierboek';
  return null;
}

export async function decideDay<C extends VersionConfig = VersionConfig>(input: {
  date: string;
  cfgs: C[];
  hooks?: StrategyHooks<C>;
  barsBySymbol: Record<string, Bar[]>;
  benchmark: Bar[];
  store: Store;
  veto?: VetoFn;
  /** true = papiermodus (alleen echte boeken), false = schaduw (nooit een echt boek aanraken). */
  expectReal?: boolean;
}): Promise<{ planned: Record<string, OrderIntent[]> }> {
  const { date, store } = input;
  const hooks = (input.hooks ?? rotationHooks) as StrategyHooks<C>;
  const planned: Record<string, OrderIntent[]> = {};
  const spy = input.benchmark[input.benchmark.length - 1];
  if (!spy || dateOf(spy) !== date) throw new Error(`geen SPY-bar voor ${date}`);

  for (const cfg of input.cfgs) {
    if (input.benchmark.length <= cfg.smaDays) {
      await store.logDecision({ date, versionId: cfg.id, kind: 'skip', detail: 'te weinig historie voor trendfilter' });
      continue;
    }
    const loaded = await store.loadBook(cfg.id);
    const mismatch = bookKindMismatch(loaded, input.expectReal);
    if (mismatch) {
      await store.logDecision({ date, versionId: cfg.id, kind: 'skip', detail: mismatch });
      continue;
    }
    const book = loaded ?? newBook(cfg, date, spy.c);
    if (book.lastDecisionDate === date) {
      await store.logDecision({ date, versionId: cfg.id, kind: 'skip', detail: 'vandaag al beslist' });
      continue;
    }
    const prices: Record<string, number> = {};
    for (const [sym, pos] of Object.entries(book.positions)) {
      const last = input.barsBySymbol[sym]?.[input.barsBySymbol[sym]!.length - 1];
      if (last && dateOf(last) === date) {
        if (!book.real) {
          const hist = (input.barsBySymbol[sym] ?? []).filter((b) => dateOf(b) < date);
          const st = hooks.stopFor(pos, cfg, hist.length ? hist : undefined, sym);
          if (!Number.isFinite(st.level) || st.level <= 0) {
            pos.highWater = Math.max(pos.highWater, last.h);
            prices[sym] = last.c;
            continue;
          }
          const r = checkStopLevel(st.level, st.kind, last);
          if (r.hit) {
            const t = applySell(book, sym, pos.qty, r.fillPrice, date, `${r.kind} stop (schaduw)`);
            if (t) { await store.logTrade(cfg.id, t); }
            hooks.onStopFilled?.({ book, cfg, symbol: sym, date });
            await store.logDecision({ date, versionId: cfg.id, kind: 'stop', symbol: sym, detail: `${r.kind} stop geraakt @ ${r.fillPrice.toFixed(2)} (schaduw)` });
            continue;
          }
        }
        pos.highWater = Math.max(pos.highWater, last.h);
      }
      prices[sym] = last?.c ?? pos.entryPrice;
    }
    const eq = equityOf(book, prices);
    book.peakEquity = Math.max(book.peakEquity, eq);
    await store.logEquity(cfg.id, logRow(book, date, prices, spy.c));

    if (!book.halted && lossLimitBreached(eq, book, cfg)) {
      book.halted = true;
      book.haltReason = `verliesgrens ${(cfg.maxLossPct * 100).toFixed(0)}% geraakt op ${date}`;
      await store.logDecision({ date, versionId: cfg.id, kind: 'halt', detail: book.haltReason });
    }

    const isFirst = book.lastRebalanceIndex === null;
    const due = isFirst || (book.lastRebalanceIndex! + 1) >= cfg.rebalanceEveryDays;
    if (!isFirst && !due) {
      book.lastRebalanceIndex! += 1;
    }
    if (book.halted || due) {
      const plan = await hooks.plan({ barsBySymbol: input.barsBySymbol, book, cfg, veto: input.veto });
      for (const v of plan.vetoes) {
        await store.logDecision({
          date, versionId: cfg.id, kind: 'veto', symbol: v.symbol, veto: v.verdict,
          detail: `${v.verdict.veto ? 'VETO' : 'doorgelaten'}${v.verdict.failedOpen ? ' (check mislukt)' : ''}: ${v.verdict.reason}`,
        });
      }
      await store.logDecision({
        date, versionId: cfg.id, kind: 'rebalance',
        detail: plan.orders.length ? plan.orders.map((o) => `${o.side} ${o.symbol}`).join(', ') : 'geen wijzigingen',
      });
      await store.savePending(cfg.id, plan.orders);
      planned[cfg.id] = plan.orders;
      if (!book.halted) book.lastRebalanceIndex = 0;
    } else {
      await store.savePending(cfg.id, []);
    }
    book.lastDecisionDate = date;
    await store.saveBook(book);
  }
  return { planned };
}

export async function executeDay<C extends VersionConfig = VersionConfig>(input: {
  date: string;
  cfgs: C[];
  hooks?: StrategyHooks<C>;
  lastPrice: Record<string, number>;
  barsBySymbol?: Record<string, Bar[]>;
  broker: MomentumBroker;
  store: Store;
  /** true = papiermodus (alleen echte boeken), false = schaduw (nooit een echt boek aanraken). */
  expectReal?: boolean;
  /** Qty van andere sleeves per symbool; nodig zodra meerdere strategieën hetzelfde symbool houden. */
  foreignQty?: ForeignQtyFn;
}): Promise<{ trades: TradeLogRow[] }> {
  const { date, broker, store, foreignQty } = input;
  const hooks = (input.hooks ?? rotationHooks) as StrategyHooks<C>;
  const trades: TradeLogRow[] = [];

  for (const cfg of input.cfgs) {
    const book = await store.loadBook(cfg.id);
    const mismatch = bookKindMismatch(book, input.expectReal);
    if (mismatch) {
      await store.logDecision({ date, versionId: cfg.id, kind: 'skip', detail: mismatch });
      continue;
    }
    if (!book) continue;
    const stopPx = momentumStopClientPrefix(cfg);

    const record = async (t: TradeLogRow | null) => {
      if (!t) return;
      trades.push(t);
      await store.logTrade(cfg.id, t);
    };

    /** Verwerk alleen het nieuwe deel van (partial) stop-fills, per broker-order. */
    const processStopFills = async (sym: string): Promise<boolean> => {
      const pos = book.positions[sym];
      if (!pos) return false;
      const q = { versionId: cfg.id, symbol: sym, since: pos.entryDate, stopClientPrefix: stopPx };
      const fills = broker.stopFills
        ? await broker.stopFills(q)
        : [await broker.stopFill(q)].filter((x): x is Fill => !!x);
      let any = false;
      for (const f of fills) {
        const delta = fillDelta(book, f);
        if (delta <= 0) continue;
        markApplied(book, f);
        if (!book.positions[sym]) continue;
        await record(applySell(book, sym, delta, f.price, date, 'stop (broker)'));
        any = true;
        await store.logDecision({
          date, versionId: cfg.id, kind: 'stop', symbol: sym,
          detail: `stop gevuld ${delta} @ ${f.price.toFixed(2)}${f.done === false ? ' (deels)' : ''}`,
        });
      }
      if (any) {
        if (!book.positions[sym]) hooks.onStopFilled?.({ book, cfg, symbol: sym, date });
        await store.saveBook(book);
      }
      return any;
    };

    /** Boek het nieuwe deel van een market-fill; open (partial) orders volgende run verder. */
    const applyMarketFill = async (f: Fill, meta: OpenOrderMeta) => {
      const delta = fillDelta(book, f);
      if (delta > 0) {
        markApplied(book, f);
        if (meta.side === 'buy') {
          // crypto: de fee gaat van de coin af; het boek volgt wat er echt binnenkwam, de kas betaalt de hele fill
          const ratio = f.received != null && f.qty > 0 ? Math.min(1, f.received / f.qty) : 1;
          const got = roundQty(delta * ratio);
          await record(applyBuy(book, meta.symbol, got, (f.price * delta) / got, date, meta.reason, {
            signalDate: meta.signalDate, brokerFill: true,
          }));
        } else {
          await record(applySell(book, meta.symbol, delta, f.price, date, meta.reason));
        }
      }
      if (f.done === false) (book.openOrders ??= {})[f.orderId] = meta;
      else if (book.openOrders) delete book.openOrders[f.orderId];
    };

    /** Een afgesloten sell met nog stukken over: de exit opnieuw in de rij. */
    const requeued: OrderIntent[] = [];
    const finishOpenOrder = (orderId: string, meta: OpenOrderMeta) => {
      if (book.openOrders) delete book.openOrders[orderId];
      const left = book.positions[meta.symbol];
      if (meta.side === 'sell' && meta.requeue && left) requeued.push({ ...meta.requeue, qty: left.qty });
    };
    /** Symbolen met een order waarvan de echte status (nog) onbekend is: niets nieuws plaatsen. */
    const unresolved = new Set<string>();
    /** Symbolen waarvan een eerdere buy nu pas als gevuld bekend werd: een buy-intent daarvoor is op een leeg boek gepland. */
    const resolvedBuys = new Set<string>();

    const ensureStop = async (sym: string) => {
      if (!book.positions[sym]) return;
      const sellOpen = Object.values(book.openOrders ?? {}).some((m) => m.symbol === sym && m.side === 'sell');
      if (sellOpen) return; // een lopende market sell houdt de stukken vast
      try {
        await placeDisasterStop({
          broker, book, cfg, sym, hooks: hooks as StrategyHooks, stopPx,
          bars: histBars(input.barsBySymbol, sym, date), foreignQty,
        });
        if (book.stopMissing?.[sym]) delete book.stopMissing[sym];
      } catch (e) {
        (book.stopMissing ??= {})[sym] = date;
        await store.logDecision({
          date, versionId: cfg.id, kind: 'stop', symbol: sym,
          detail: `stop ontbreekt: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    };

    // 1. Lopende (deels gevulde) market orders van eerdere runs.
    if (broker.orderFill) {
      for (const [orderId, meta] of Object.entries({ ...(book.openOrders ?? {}) })) {
        let f: Fill | null;
        try {
          f = await broker.orderFill({ orderId });
        } catch (e) {
          unresolved.add(meta.symbol);
          await store.logDecision({
            date, versionId: cfg.id, kind: 'skip', symbol: meta.symbol,
            detail: `orderstatus onbekend, niets nieuws op ${meta.symbol}: ${e instanceof Error ? e.message : String(e)}`,
          });
          continue;
        }
        if (f) await applyMarketFill(f, meta);
        if (f && f.qty > 0 && meta.side === 'buy') resolvedBuys.add(meta.symbol);
        if (!f || f.done !== false) finishOpenOrder(orderId, meta);
      }
    }
    for (const m of Object.values(book.openOrders ?? {})) unresolved.add(m.symbol);

    // 2. Stop-fills (ook partials, maar elk stuk maar één keer).
    for (const sym of Object.keys(book.positions)) await processStopFills(sym);
    await store.saveBook(book);

    // 3. Geplande orders.
    const pending = [...(await store.loadPending(cfg.id)), ...requeued];
    const remaining: OrderIntent[] = [];

    for (const o of pending) {
      const px = input.lastPrice[o.symbol];
      if (!px) {
        remaining.push(o);
        continue;
      }
      if (unresolved.has(o.symbol)) {
        // er loopt al een order (of de status is onbekend): dit intent wordt daardoor uitgevoerd, nooit dubbel
        await store.logDecision({
          date, versionId: cfg.id, kind: 'skip', symbol: o.symbol,
          detail: `${o.side} niet geplaatst: er loopt nog een order op ${o.symbol}`,
        });
        if (o.side === 'sell') remaining.push(o);
        continue;
      }

      if (o.side === 'sell') {
        if (!book.positions[o.symbol]) continue; // niets (meer) in dit boek
        const target = () => Math.min(o.qty ?? Infinity, book.positions[o.symbol]?.qty ?? 0);

        const outcome = (await broker.cancelStop({ versionId: cfg.id, symbol: o.symbol, stopClientPrefix: stopPx })) ?? 'canceled';
        if (outcome === 'filled') {
          await processStopFills(o.symbol);
          if (!book.positions[o.symbol]) continue; // de stop deed de exit al
        } else if (outcome === 'failed' || outcome === 'timeout') {
          await store.logDecision({
            date, versionId: cfg.id, kind: 'skip', symbol: o.symbol,
            detail: `exit uitgesteld: stop niet bevestigd geannuleerd (${outcome})`,
          });
          remaining.push(o);
          await ensureStop(o.symbol);
          continue;
        }

        const qty = Math.min(target(), await sleeveQty(broker, book, o.symbol, foreignQty));
        if (!(qty > 0)) {
          await store.logDecision({
            date, versionId: cfg.id, kind: 'skip', symbol: o.symbol,
            detail: 'exit uitgesteld: broker toont geen stukken voor dit boek',
          });
          remaining.push(o);
          await ensureStop(o.symbol);
          continue;
        }

        let fill: Fill | null = null;
        try {
          fill = await broker.marketOrder({
            versionId: cfg.id, symbol: o.symbol, side: 'sell', qty,
            clientOrderId: momentumClientOrderId(cfg, date, o.symbol, 's'),
          });
        } catch (e) {
          await store.logDecision({
            date, versionId: cfg.id, kind: 'skip', symbol: o.symbol,
            detail: `exit mislukt: ${e instanceof Error ? e.message : String(e)}`,
          });
        }
        if (fill) await applyMarketFill(fill, { symbol: o.symbol, side: 'sell', reason: o.reason, requeue: o });
        if (fill && fill.done === false) {
          await store.saveBook(book);
          continue; // rest volgt via openOrders; stukken zitten in de lopende sell
        }
        const left = book.positions[o.symbol];
        if (left) {
          // geen of gedeeltelijke fill: stop terug op wat er nu echt is, exit blijft staan
          await ensureStop(o.symbol);
          remaining.push(o.qty != null && fill ? { ...o, qty: Math.max(0, roundQty(o.qty - fill.qty)) || left.qty } : o);
        }
        await store.saveBook(book);
        continue;
      }

      if (resolvedBuys.has(o.symbol)) {
        await store.logDecision({
          date, versionId: cfg.id, kind: 'skip', symbol: o.symbol,
          detail: `buy ${o.symbol} niet geplaatst: eerdere buy bleek alsnog gevuld (plan was op een onvolledig boek)`,
        });
        continue;
      }
      const whole = (x: number) => (cfg.fractional ? Math.floor(x * 1e6) / 1e6 : Math.floor(x));
      const qty = Math.min(whole((o.notionalUsd ?? 0) / px), whole(book.cash / px));
      if (qty <= 0) continue;
      let fill: Fill | null = null;
      try {
        fill = await broker.marketOrder({
          versionId: cfg.id, symbol: o.symbol, side: 'buy', qty,
          clientOrderId: momentumClientOrderId(cfg, date, o.symbol, 'b'),
        });
      } catch (e) {
        await store.logDecision({
          date, versionId: cfg.id, kind: 'skip', symbol: o.symbol,
          detail: `koop mislukt: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
      if (!fill) {
        remaining.push(o);
        continue;
      }
      // Een fill gaat nooit terug in pending: ook als de stop hierna mislukt (zie stopMissing).
      await applyMarketFill(fill, { symbol: o.symbol, side: 'buy', reason: o.reason, signalDate: o.signalDate });
      await store.saveBook(book);
      await ensureStop(o.symbol);
      await store.saveBook(book);
    }

    await store.savePending(cfg.id, remaining);

    // 4. Elke positie een stop op de juiste qty en het juiste niveau.
    for (const sym of Object.keys(book.positions)) await ensureStop(sym);
    await store.saveBook(book);
  }
  return { trades };
}

function histBars(barsBySymbol: Record<string, Bar[]> | undefined, sym: string, date: string): Bar[] | undefined {
  const h = (barsBySymbol?.[sym] ?? []).filter((b) => dateOf(b) < date);
  return h.length ? h : undefined;
}

const round2 = (x: number) => Math.round(x * 100) / 100;
