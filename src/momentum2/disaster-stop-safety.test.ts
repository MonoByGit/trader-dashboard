import { makeBars } from './fixtures';
import { m5Hooks } from '../momentum5/plan';
import { m5Versions } from '../momentum5/config';
import { m6Hooks } from '../momentum6/plan';
import { m6Config } from '../momentum6/config';
import { barLowForStopCheck } from './bad-tick';
import { checkStopLevel } from './risk';
import { executeDay, type Broker, type Store } from './live';
import { momentumStopClientPrefix } from './order-tag';
import { reconcileDisasterStops, type OpenStopOrder } from './reconcile-disaster-stops';
import { simulateVersion } from './simulate';
import type { OrderIntent, TradeLogRow, VersionBook } from './types';
import { newBook } from './book';

const [m5Cfg] = m5Versions(100_000);
const m6Cfg = m6Config(100_000);

function memStore(initial?: VersionBook) {
  let book = initial ? structuredClone(initial) : null;
  let pending: OrderIntent[] = [];
  const store: Store = {
    loadBook: async () => book,
    saveBook: async (b) => { book = structuredClone(b); },
    loadPending: async () => pending,
    savePending: async (_id, o) => { pending = o; },
    logEquity: async () => {},
    logTrade: async () => {},
    logDecision: async () => {},
  };
  return { store, getBook: () => book!, setBook: (b: VersionBook) => { book = b; }, pending: () => pending };
}

function trackingBroker(lastPrice: Record<string, number>) {
  const stops: OpenStopOrder[] = [];
  const positions: Record<string, number> = {};
  const broker: Broker & {
    listOpenStops(o: { stopClientPrefix: string }): Promise<OpenStopOrder[]>;
    stops: OpenStopOrder[];
    positions: Record<string, number>;
  } = {
    stops,
    positions,
    marketOrder: async (o) => {
      if (o.side === 'buy') positions[o.symbol] = (positions[o.symbol] ?? 0) + o.qty;
      else positions[o.symbol] = Math.max(0, (positions[o.symbol] ?? 0) - o.qty);
      return { orderId: o.clientOrderId, qty: o.qty, price: lastPrice[o.symbol] ?? 100 };
    },
    setStop: async (o) => {
      const cid = `${o.stopClientPrefix}${o.symbol}-${Math.round(o.stopPrice * 100)}`;
      broker.stops = broker.stops.filter((s) => !s.clientOrderId.startsWith(o.stopClientPrefix) || s.symbol !== o.symbol);
      broker.stops.push({ symbol: o.symbol, qty: o.qty, stopPrice: o.stopPrice, clientOrderId: cid });
    },
    cancelStop: async (o) => {
      if (o.orderId) {
        broker.stops = broker.stops.filter((s) => s.orderId !== o.orderId);
        return;
      }
      const p = o.stopClientPrefix ?? '';
      broker.stops = broker.stops.filter((s) => !(s.clientOrderId.startsWith(p) && s.symbol === o.symbol));
    },
    stopFill: async () => null,
    listOpenStops: async (o) => broker.stops.filter((s) => s.clientOrderId.startsWith(o.stopClientPrefix)),
    positionQty: async ({ symbol }) => positions[symbol] ?? 0,
  };
  return broker;
}

describe('disaster stop safety', () => {
  it('zet stop na buy-fill en annuleert bij exit', async () => {
    const mem = memStore();
    const broker = trackingBroker({ QLD: 50 });
    const book = newBook(m5Cfg!, '2024-01-01', 100);
    book.real = true;
    book.cash = 5000;
    mem.setBook(book);
    await mem.store.savePending(m5Cfg!.id, [{ symbol: 'QLD', side: 'buy', notionalUsd: 1000, reason: 'test' }]);
    const bars = { QLD: makeBars(60, 50, 0.01, 0.02), SPY: makeBars(60, 100, 0.001, 0.01) };
    await executeDay({
      date: '2024-06-01',
      cfgs: [m5Cfg!],
      hooks: m5Hooks,
      lastPrice: { QLD: 50 },
      barsBySymbol: bars,
      broker,
      store: mem.store,
    });
    expect(broker.stops.some((s) => s.symbol === 'QLD' && s.stopPrice > 0)).toBe(true);
    const prefix = momentumStopClientPrefix(m5Cfg!);
    expect(broker.stops[0]!.clientOrderId.startsWith(prefix)).toBe(true);

    const pos = mem.getBook().positions.QLD!;
    await mem.store.savePending(m5Cfg!.id, [{ symbol: 'QLD', side: 'sell', qty: pos.qty, reason: 'exit' }]);
    await executeDay({
      date: '2024-06-02',
      cfgs: [m5Cfg!],
      hooks: m5Hooks,
      lastPrice: { QLD: 48 },
      barsBySymbol: bars,
      broker,
      store: mem.store,
    });
    expect(broker.stops.filter((s) => s.symbol === 'QLD')).toHaveLength(0);
  });

  it('reconcile maakt stop opnieuw na restart', async () => {
    const mem = memStore();
    const broker = trackingBroker({ 'BTC/USD': 100 });
    const book = newBook(m6Cfg, '2024-01-01', 100);
    book.real = true;
    book.positions['BTC/USD'] = { qty: 0.5, entryPrice: 100, entryDate: '2024-05-01', highWater: 110, signalDate: '2024-05-01' };
    mem.setBook(book);
    broker.stops.length = 0;
    broker.positions['BTC/USD'] = 0.5;
    const btc = makeBars(80, 100, 0.005, 0.02);
    const r = await reconcileDisasterStops({
      date: '2024-06-10',
      cfgs: [m6Cfg],
      books: { [m6Cfg.id]: book },
      hooks: m6Hooks,
      barsBySymbol: { 'BTC/USD': btc },
      broker,
    });
    expect(r.recreated.length).toBeGreaterThan(0);
    expect(broker.stops).toHaveLength(1);
    expect(broker.stops[0]!.clientOrderId.startsWith(momentumStopClientPrefix(m6Cfg))).toBe(true);
  });

  it('reconcile zet geen stop voor stukken die niet bij de broker liggen (geen short)', async () => {
    const broker = trackingBroker({ 'BTC/USD': 100 });
    const book = newBook(m6Cfg, '2024-01-01', 100);
    book.real = true;
    book.positions['BTC/USD'] = { qty: 0.5, entryPrice: 100, entryDate: '2024-05-01', highWater: 110, signalDate: '2024-05-01' };
    const r = await reconcileDisasterStops({
      date: '2024-06-10',
      cfgs: [m6Cfg],
      books: { [m6Cfg.id]: book },
      hooks: m6Hooks,
      barsBySymbol: { 'BTC/USD': makeBars(80, 100, 0.005, 0.02) },
      broker,
    });
    expect(broker.stops).toHaveLength(0);
    expect(r.failed.some((x) => x.includes('geen broker-qty'))).toBe(true);
  });

  it('reconcile ruimt stop op zonder positie op', async () => {
    const broker = trackingBroker({});
    broker.stops.push({
      symbol: 'QLD',
      qty: 5,
      stopPrice: 30,
      clientOrderId: `${momentumStopClientPrefix(m5Cfg!)}QLD-3000`,
    });
    const book = newBook(m5Cfg!, '2024-01-01', 100);
    book.real = true;
    const r = await reconcileDisasterStops({
      date: '2024-06-10',
      cfgs: [m5Cfg!],
      books: { [m5Cfg!.id]: book },
      hooks: m5Hooks,
      barsBySymbol: { QLD: makeBars(40, 50, 0, 0.01) },
      broker,
    });
    expect(r.cancelled.length).toBe(1);
    expect(broker.stops).toHaveLength(0);
  });

  it('m5s- en m6s-prefix botsen niet', () => {
    expect(momentumStopClientPrefix(m5Cfg!)).toMatch(/^m5s-m5-nasdaq-trend-/);
    expect(momentumStopClientPrefix(m6Cfg)).toMatch(/^m6s-m6-btc-breakout-/);
    expect(momentumStopClientPrefix(m5Cfg!)).not.toBe(momentumStopClientPrefix(m6Cfg));
  });

  it('slechte tick triggert disaster stop niet in sim', async () => {
    const btc = makeBars(40, 100, 0.002, 0.02);
    const book = newBook(m6Cfg, btc[20]!.t.slice(0, 10), 100);
    book.positions['BTC/USD'] = {
      qty: 1,
      entryPrice: 100,
      entryDate: btc[20]!.t.slice(0, 10),
      highWater: 120,
      signalDate: btc[20]!.t.slice(0, 10),
    };
    const last = btc.length - 1;
    btc[last] = { ...btc[last]!, o: 100, c: 100, h: 101, l: 50 };
    const st = m6Hooks.stopFor(book.positions['BTC/USD']!, m6Cfg, btc.slice(0, last + 1), 'BTC/USD');
    expect(st.level).toBeGreaterThan(50);
    const eff = barLowForStopCheck(btc[last]!);
    expect(checkStopLevel(st.level, st.kind, { o: btc[last]!.o, l: eff }).hit).toBe(false);

    const r = await simulateVersion(
      m6Cfg,
      { benchmark: btc, barsBySymbol: { 'BTC/USD': btc } },
      { hooks: m6Hooks, initialBook: book, fillGaps: true },
    );
    expect(r.trades.filter((t: TradeLogRow) => t.reason.includes('stop'))).toHaveLength(0);
  });
});
