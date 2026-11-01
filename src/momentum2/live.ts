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
export interface Fill { orderId: string; qty: number; price: number }

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function brokerQty(broker: MomentumBroker, book: VersionBook, symbol: string): Promise<number> {
  const pos = book.positions[symbol];
  if (book.real && broker.positionQty) {
    const q = await broker.positionQty({ symbol });
    if (q != null && q >= 0) return q;
  }
  return pos?.qty ?? 0;
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
}): Promise<void> {
  const { broker, book, cfg, sym, hooks, stopPx, bars: hist } = input;
  const qty = await brokerQty(broker, book, sym);
  if (qty <= 0) return;
  const pos = book.positions[sym];
  if (!pos) return;
  const st = hooks.stopFor(pos, cfg, hist?.length ? hist : undefined, sym);
  if (!Number.isFinite(st.level) || st.level <= 0) return;
  await setStopWithRetry(broker, {
    versionId: cfg.id,
    symbol: sym,
    qty,
    stopPrice: round2(st.level),
    stopClientPrefix: stopPx,
  });
  if (book.real && broker.positionQty) {
    const bq = await broker.positionQty({ symbol: sym });
    if (bq != null && bq > 0 && book.positions[sym]) book.positions[sym]!.qty = bq;
  }
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
}): Promise<{ trades: TradeLogRow[] }> {
  const { date, broker, store } = input;
  const hooks = (input.hooks ?? rotationHooks) as StrategyHooks<C>;
  const trades: TradeLogRow[] = [];

  for (const cfg of input.cfgs) {
    const book = await store.loadBook(cfg.id);
    if (!book) continue;
    const stopPx = momentumStopClientPrefix(cfg);

    for (const [sym, pos] of Object.entries({ ...book.positions })) {
      const f = await broker.stopFill({ versionId: cfg.id, symbol: sym, since: pos.entryDate, stopClientPrefix: stopPx });
      if (f) {
        const sellQty = Math.min(pos.qty, f.qty);
        const t = applySell(book, sym, sellQty, f.price, date, 'stop (broker)');
        if (t) { trades.push(t); await store.logTrade(cfg.id, t); }
        hooks.onStopFilled?.({ book, cfg, symbol: sym, date });
        await store.logDecision({ date, versionId: cfg.id, kind: 'stop', symbol: sym, detail: `stop gevuld @ ${f.price.toFixed(2)}` });
        await store.saveBook(book);
      }
    }

    const pending = await store.loadPending(cfg.id);
    const remaining: OrderIntent[] = [];

    for (const o of pending) {
      const px = input.lastPrice[o.symbol];
      if (!px) {
        remaining.push(o);
        continue;
      }

      if (o.side === 'sell') {
        const bookQty = await brokerQty(broker, book, o.symbol);
        const qty = Math.min(o.qty ?? 0, bookQty);
        if (qty <= 0) continue;

        const hist = (input.barsBySymbol?.[o.symbol] ?? []).filter((b) => dateOf(b) < date);
        const pos = book.positions[o.symbol];
        const st = pos ? hooks.stopFor(pos, cfg, hist.length ? hist : undefined, o.symbol) : { level: -1, kind: 'hard' };
        const stopBackup =
          Number.isFinite(st.level) && st.level > 0
            ? { qty, stopPrice: round2(st.level) }
            : null;

        await broker.cancelStop({ versionId: cfg.id, symbol: o.symbol, stopClientPrefix: stopPx });
        const fill = await broker.marketOrder({
          versionId: cfg.id, symbol: o.symbol, side: 'sell', qty,
          clientOrderId: momentumClientOrderId(cfg, date, o.symbol, 's'),
        });
        if (!fill) {
          if (stopBackup) {
            await setStopWithRetry(broker, {
              versionId: cfg.id,
              symbol: o.symbol,
              qty: stopBackup.qty,
              stopPrice: stopBackup.stopPrice,
              stopClientPrefix: stopPx,
            });
          }
          remaining.push(o);
          continue;
        }
        const sellQty = Math.min(qty, fill.qty);
        const t = applySell(book, o.symbol, sellQty, fill.price, date, o.reason);
        if (t) { trades.push(t); await store.logTrade(cfg.id, t); }
        await store.saveBook(book);
        continue;
      }

      const whole = (x: number) => (cfg.fractional ? Math.floor(x * 1e6) / 1e6 : Math.floor(x));
      const qty = Math.min(whole((o.notionalUsd ?? 0) / px), whole(book.cash / px));
      if (qty <= 0) continue;
      const fill = await broker.marketOrder({
        versionId: cfg.id, symbol: o.symbol, side: 'buy', qty,
        clientOrderId: momentumClientOrderId(cfg, date, o.symbol, 'b'),
      });
      if (!fill) {
        remaining.push(o);
        continue;
      }
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
      await store.saveBook(book);

      try {
        await placeDisasterStop({
          broker,
          book,
          cfg,
          sym: o.symbol,
          hooks: hooks as StrategyHooks,
          stopPx,
          bars: histBars(input.barsBySymbol, o.symbol, date),
        });
      } catch {
        remaining.push(o);
      }
      await store.saveBook(book);
    }

    await store.savePending(cfg.id, remaining);

    for (const sym of Object.keys(book.positions)) {
      const hist = histBars(input.barsBySymbol, sym, date);
      try {
        await placeDisasterStop({ broker, book, cfg, sym, hooks: hooks as StrategyHooks, stopPx, bars: hist });
      } catch {
        /* volgende run reconcile */
      }
    }
    await store.saveBook(book);
  }
  return { trades };
}

function histBars(barsBySymbol: Record<string, Bar[]> | undefined, sym: string, date: string): Bar[] | undefined {
  const h = (barsBySymbol?.[sym] ?? []).filter((b) => dateOf(b) < date);
  return h.length ? h : undefined;
}

const round2 = (x: number) => Math.round(x * 100) / 100;
