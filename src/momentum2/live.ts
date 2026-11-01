import { applyBuy, applySell, equityOf, logRow, newBook } from './book';
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
export interface Fill { orderId: string; qty: number; price: number }

export interface Broker {
  /** Marktorder voor hele aandelen. Geeft de vulling terug, of null als er niet gevuld is. */
  marketOrder(o: { versionId: string; symbol: string; side: 'buy' | 'sell'; qty: number; clientOrderId: string }): Promise<Fill | null>;
  /** GTC-stop voor deze versie en dit symbool; vervangt een eerdere stop. Stop wordt alleen omhoog gezet. */
  setStop(o: { versionId: string; symbol: string; qty: number; stopPrice: number; stopClientPrefix: string }): Promise<void>;
  cancelStop(o: { versionId: string; symbol: string; stopClientPrefix?: string }): Promise<void>;
  /** Is de stop van deze versie voor dit symbool afgegaan sinds `since` (ISO, de instapdatum)? */
  stopFill(o: { versionId: string; symbol: string; since: string; stopClientPrefix: string }): Promise<Fill | null>;
}

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

export async function decideDay<C extends VersionConfig = VersionConfig>(input: {
  date: string;
  cfgs: C[];
  hooks?: StrategyHooks<C>;
  barsBySymbol: Record<string, Bar[]>;
  benchmark: Bar[];
  store: Store;
  veto?: VetoFn;
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
    const book = (await store.loadBook(cfg.id)) ?? newBook(cfg, date, spy.c);
    if (book.lastDecisionDate === date) {
      await store.logDecision({ date, versionId: cfg.id, kind: 'skip', detail: 'vandaag al beslist' });
      continue;
    }
    const prices: Record<string, number> = {};
    for (const [sym, pos] of Object.entries(book.positions)) {
      const last = input.barsBySymbol[sym]?.[input.barsBySymbol[sym]!.length - 1];
      if (last && dateOf(last) === date) {
        // Schaduwboeken hebben geen broker-stop: emuleer de stop op de dagbar (stand van vóór vandaag).
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

    // Live telt lastRebalanceIndex de handelsdagen sinds de laatste rebalance (null = nog nooit).
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
  /** Laatste koers per symbool, voor het omrekenen van bedragen naar hele aandelen. */
  lastPrice: Record<string, number>;
  /** Dagbars per symbool; stops gebruiken alleen data t/m gisteren. */
  barsBySymbol?: Record<string, Bar[]>;
  broker: Broker;
  store: Store;
}): Promise<{ trades: TradeLogRow[] }> {
  const { date, broker, store } = input;
  const hooks = (input.hooks ?? rotationHooks) as StrategyHooks<C>;
  const trades: TradeLogRow[] = [];

  for (const cfg of input.cfgs) {
    const book = await store.loadBook(cfg.id);
    if (!book) continue;

    // 1. Stops die sinds gisteren zijn afgegaan.
    for (const [sym, pos] of Object.entries(book.positions)) {
      const stopPx = momentumStopClientPrefix(cfg);
      const f = await broker.stopFill({ versionId: cfg.id, symbol: sym, since: pos.entryDate, stopClientPrefix: stopPx });
      if (f) {
        const t = applySell(book, sym, f.qty, f.price, date, 'stop (broker)');
        if (t) { trades.push(t); await store.logTrade(cfg.id, t); }
        hooks.onStopFilled?.({ book, cfg, symbol: sym, date });
        await store.logDecision({ date, versionId: cfg.id, kind: 'stop', symbol: sym, detail: `stop gevuld @ ${f.price.toFixed(2)}` });
      }
    }

    // 2. Geplande orders, verkopen eerst.
    const pending = await store.loadPending(cfg.id);
    const stopPx = momentumStopClientPrefix(cfg);
    for (const o of pending) {
      const px = input.lastPrice[o.symbol];
      if (!px) continue;
      if (o.side === 'sell') {
        const qty = Math.min(o.qty ?? 0, book.positions[o.symbol]?.qty ?? 0);
        if (qty <= 0) continue;
        await broker.cancelStop({ versionId: cfg.id, symbol: o.symbol, stopClientPrefix: stopPx });
        const fill = await broker.marketOrder({
          versionId: cfg.id, symbol: o.symbol, side: 'sell', qty,
          clientOrderId: momentumClientOrderId(cfg, date, o.symbol, 's'),
        });
        if (!fill) continue;
        const t = applySell(book, o.symbol, fill.qty, fill.price, date, o.reason);
        if (t) { trades.push(t); await store.logTrade(cfg.id, t); }
      } else {
        const whole = (x: number) => (cfg.fractional ? Math.floor(x * 1e6) / 1e6 : Math.floor(x));
        const qty = Math.min(whole((o.notionalUsd ?? 0) / px), whole(book.cash / px));
        if (qty <= 0) continue;
        const fill = await broker.marketOrder({
          versionId: cfg.id, symbol: o.symbol, side: 'buy', qty,
          clientOrderId: momentumClientOrderId(cfg, date, o.symbol, 'b'),
        });
        if (!fill) continue;
        const t = applyBuy(
          book,
          o.symbol,
          fill.qty,
          fill.price,
          date,
          o.reason,
          o.signalDate ? { signalDate: o.signalDate } : undefined,
        );
        if (t) { trades.push(t); await store.logTrade(cfg.id, t); }
      }
    }
    await store.savePending(cfg.id, []);

    // 3. Stops: harde stop bij entry, daarna meebewegend omhoog (ATR e.d. alleen t/m gisteren).
    for (const [sym, pos] of Object.entries(book.positions)) {
      const hist = (input.barsBySymbol?.[sym] ?? []).filter((b) => dateOf(b) < date);
      const st = hooks.stopFor(pos, cfg, hist.length ? hist : undefined, sym);
      if (!Number.isFinite(st.level) || st.level <= 0) continue;
      await broker.setStop({
        versionId: cfg.id,
        symbol: sym,
        qty: pos.qty,
        stopPrice: round2(st.level),
        stopClientPrefix: stopPx,
      });
    }
    await store.saveBook(book);
  }
  return { trades };
}

const round2 = (x: number) => Math.round(x * 100) / 100;
