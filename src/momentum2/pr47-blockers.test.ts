/**
 * Repros voor de zes PR 47-blockers (review Dave op a6fcc52), tegen een nep-Alpaca met de echte regels:
 * account-brede posities, open sells reserveren stukken, partially_filled zichtbaar, unieke client_order_id.
 */
import { makeAlpacaPaperBroker, stopClientOrderId, stopLimitPrice } from './alpaca-paper-broker';
import { newBook } from './book';
import { m5Hooks } from '../momentum5/plan';
import { m5Versions } from '../momentum5/config';
import { m6Hooks } from '../momentum6/plan';
import { m6Config } from '../momentum6/config';
import { decideDay, executeDay, type DecisionRecord, type ForeignQtyFn, type Store } from './live';
import { momentumStopClientPrefix } from './order-tag';
import { reconcileDisasterStops } from './reconcile-disaster-stops';
import type { StrategyHooks } from './hooks';
import { FakeAlpaca } from './testing/fake-alpaca';
import type { OrderIntent, VersionBook, VersionConfig } from './types';
import { makeBars } from './fixtures';

const [m5Cfg] = m5Versions(100_000);
const m6Cfg = m6Config(100_000);
const noSleep = async () => {};

function memStore(initial?: VersionBook) {
  let book = initial ? structuredClone(initial) : null;
  let pending: OrderIntent[] = [];
  const decisions: DecisionRecord[] = [];
  const store: Store = {
    loadBook: async () => (book ? structuredClone(book) : null),
    saveBook: async (b) => { book = structuredClone(b); },
    loadPending: async () => structuredClone(pending),
    savePending: async (_id, o) => { pending = structuredClone(o); },
    logEquity: async () => {},
    logTrade: async () => {},
    logDecision: async (d) => { decisions.push(d); },
  };
  return {
    store,
    book: () => book!,
    pending: () => pending,
    setPending: (p: OrderIntent[]) => { pending = p; },
    decisions,
  };
}

/** Vast stopniveau, zodat de test het niveau stuurt. */
function fixedStop<C extends VersionConfig>(base: StrategyHooks<C>, level: { v: number }): StrategyHooks<C> {
  return { ...base, stopFor: () => ({ level: level.v, kind: 'hard' }) };
}

function realBook(cfg: VersionConfig, positions: VersionBook['positions'], cash = 5_000): VersionBook {
  const b = newBook(cfg, '2024-01-01', 100);
  b.real = true;
  b.cash = cash;
  b.positions = positions;
  return b;
}

const pos = (qty: number, entryPrice = 50) => ({ qty, entryPrice, entryDate: '2024-05-01', highWater: entryPrice, signalDate: '2024-05-01' });

function setup(cfg: VersionConfig, book: VersionBook) {
  const fake = new FakeAlpaca();
  const broker = makeAlpacaPaperBroker(fake, { sleep: noSleep, pollAttempts: 2 });
  const mem = memStore(book);
  return { fake, broker, mem, prefix: momentumStopClientPrefix(cfg) };
}

describe('PR 47 blocker 1: exit-sell met eigen stop open', () => {
  it('annuleert de stop, wacht op canceled en verkoopt de echte sleeve-qty', async () => {
    const { fake, broker, mem, prefix } = setup(m5Cfg!, realBook(m5Cfg!, { QLD: pos(10) }));
    fake.seedPosition('QLD', 10);
    fake.prices.QLD = 48;
    await broker.setStop({ versionId: m5Cfg!.id, symbol: 'QLD', qty: 10, stopPrice: 40, stopClientPrefix: prefix });
    expect(fake.available('QLD')).toBe(0); // de stop houdt alles vast

    mem.setPending([{ symbol: 'QLD', side: 'sell', qty: 10, reason: 'exit' }]);
    await executeDay({
      date: '2024-06-03', cfgs: [m5Cfg!], hooks: fixedStop(m5Hooks, { v: 40 }), lastPrice: { QLD: 48 },
      broker, store: mem.store, expectReal: true,
    });

    expect(fake.pos.QLD).toBeUndefined();
    expect(mem.book().positions.QLD).toBeUndefined();
    expect(mem.pending()).toHaveLength(0);
    expect(fake.openStops('QLD')).toHaveLength(0);
  });

  it('laat de exit in pending en de stop staan als annuleren niet bevestigd wordt', async () => {
    const { fake, broker, mem, prefix } = setup(m5Cfg!, realBook(m5Cfg!, { QLD: pos(10) }));
    fake.seedPosition('QLD', 10);
    await broker.setStop({ versionId: m5Cfg!.id, symbol: 'QLD', qty: 10, stopPrice: 40, stopClientPrefix: prefix });
    fake.cancelOrder = async () => { throw new Error('network'); };

    mem.setPending([{ symbol: 'QLD', side: 'sell', qty: 10, reason: 'exit' }]);
    await executeDay({
      date: '2024-06-03', cfgs: [m5Cfg!], hooks: fixedStop(m5Hooks, { v: 40 }), lastPrice: { QLD: 48 },
      broker, store: mem.store, expectReal: true,
    });

    expect(fake.pos.QLD).toBe(10);
    expect(mem.pending()).toHaveLength(1);
    expect(fake.openStops('QLD')).toHaveLength(1);
  });

  it('stop vult tijdens annuleren: geen dubbele sell, boek leeg', async () => {
    const { fake, broker, mem, prefix } = setup(m5Cfg!, realBook(m5Cfg!, { QLD: pos(10) }));
    fake.seedPosition('QLD', 10);
    await broker.setStop({ versionId: m5Cfg!.id, symbol: 'QLD', qty: 10, stopPrice: 40, stopClientPrefix: prefix });
    const realCancel = fake.cancelOrder.bind(fake);
    fake.cancelOrder = async (id) => {
      fake.triggerStop('QLD', 10, 40);
      return realCancel(id);
    };
    mem.setPending([{ symbol: 'QLD', side: 'sell', qty: 10, reason: 'exit' }]);
    await executeDay({
      date: '2024-06-03', cfgs: [m5Cfg!], hooks: fixedStop(m5Hooks, { v: 40 }), lastPrice: { QLD: 48 },
      broker, store: mem.store, expectReal: true,
    });
    expect(fake.calls.filter((c) => c.startsWith('place market sell'))).toHaveLength(0);
    expect(fake.pos.QLD).toBeUndefined();
    expect(mem.book().positions.QLD).toBeUndefined();
    expect(mem.pending()).toHaveLength(0);
  });

  it('market sell faalt (4xx): stop komt terug op de huidige qty, exit blijft staan', async () => {
    const { fake, broker, mem, prefix } = setup(m5Cfg!, realBook(m5Cfg!, { QLD: pos(10) }));
    fake.seedPosition('QLD', 10);
    await broker.setStop({ versionId: m5Cfg!.id, symbol: 'QLD', qty: 10, stopPrice: 40, stopClientPrefix: prefix });
    const realPlace = fake.placeOrder.bind(fake);
    fake.placeOrder = async (o) => {
      if (o.type === 'market') throw new Error('Alpaca POST https://paper-api.alpaca.markets/v2/orders: 403 forbidden');
      return realPlace(o);
    };
    mem.setPending([{ symbol: 'QLD', side: 'sell', qty: 10, reason: 'exit' }]);
    await executeDay({
      date: '2024-06-03', cfgs: [m5Cfg!], hooks: fixedStop(m5Hooks, { v: 40 }), lastPrice: { QLD: 48 },
      broker, store: mem.store, expectReal: true,
    });
    expect(fake.openStops('QLD')).toHaveLength(1);
    expect(Number(fake.openStops('QLD')[0]!.qty)).toBe(10);
    expect(mem.pending()).toHaveLength(1);
    expect(mem.book().positions.QLD!.qty).toBe(10);
  });

  it('gedeeltelijke market sell: boek volgt de fill, stop op de rest, rest blijft als exit', async () => {
    const { fake, broker, mem, prefix } = setup(m5Cfg!, realBook(m5Cfg!, { QLD: pos(10) }));
    fake.seedPosition('QLD', 10);
    await broker.setStop({ versionId: m5Cfg!.id, symbol: 'QLD', qty: 10, stopPrice: 40, stopClientPrefix: prefix });
    fake.marketFillRatio = 0.6;
    fake.marketRestCanceled = true;
    mem.setPending([{ symbol: 'QLD', side: 'sell', qty: 10, reason: 'exit' }]);
    await executeDay({
      date: '2024-06-03', cfgs: [m5Cfg!], hooks: fixedStop(m5Hooks, { v: 40 }), lastPrice: { QLD: 48 },
      broker, store: mem.store, expectReal: true,
    });
    expect(fake.pos.QLD).toBe(4);
    expect(mem.book().positions.QLD!.qty).toBe(4);
    expect(fake.openStops('QLD').map((o) => Number(o.qty))).toEqual([4]);
    expect(mem.pending()).toEqual([{ symbol: 'QLD', side: 'sell', qty: 4, reason: 'exit' }]);
  });
});

describe('PR 47 blocker 2: stop verhogen', () => {
  it('verhoogt de stop met replace, zonder 403 en zonder tweede stop', async () => {
    const level = { v: 40 };
    const { fake, broker, mem, prefix } = setup(m5Cfg!, realBook(m5Cfg!, { QLD: pos(10) }));
    fake.seedPosition('QLD', 10);
    await broker.setStop({ versionId: m5Cfg!.id, symbol: 'QLD', qty: 10, stopPrice: 40, stopClientPrefix: prefix });
    level.v = 44;
    await executeDay({
      date: '2024-06-03', cfgs: [m5Cfg!], hooks: fixedStop(m5Hooks, level), lastPrice: { QLD: 55 },
      broker, store: mem.store, expectReal: true,
    });
    const open = fake.openStops('QLD');
    expect(open).toHaveLength(1);
    expect(Number(open[0]!.stop_price)).toBe(44);
    expect(fake.calls.some((c) => c.startsWith('replace'))).toBe(true);
    expect(mem.book().stopMissing?.QLD).toBeUndefined();
  });

  it('qty-verhoging na bijkoop: één stop op de nieuwe qty', async () => {
    const { fake, broker, mem, prefix } = setup(m5Cfg!, realBook(m5Cfg!, { QLD: pos(10) }, 1_000));
    fake.seedPosition('QLD', 10);
    fake.prices.QLD = 50;
    await broker.setStop({ versionId: m5Cfg!.id, symbol: 'QLD', qty: 10, stopPrice: 40, stopClientPrefix: prefix });
    mem.setPending([{ symbol: 'QLD', side: 'buy', notionalUsd: 500, reason: 'bijkoop' }]);
    await executeDay({
      date: '2024-06-03', cfgs: [m5Cfg!], hooks: fixedStop(m5Hooks, { v: 40 }), lastPrice: { QLD: 50 },
      broker, store: mem.store, expectReal: true,
    });
    expect(fake.pos.QLD).toBe(20);
    expect(fake.openStops('QLD').map((o) => Number(o.qty))).toEqual([20]);
  });

  it('stop nooit omlaag', async () => {
    const { fake, broker, prefix } = setup(m5Cfg!, realBook(m5Cfg!, { QLD: pos(10) }));
    fake.seedPosition('QLD', 10);
    await broker.setStop({ versionId: m5Cfg!.id, symbol: 'QLD', qty: 10, stopPrice: 44, stopClientPrefix: prefix });
    await broker.setStop({ versionId: m5Cfg!.id, symbol: 'QLD', qty: 10, stopPrice: 40, stopClientPrefix: prefix });
    expect(Number(fake.openStops('QLD')[0]!.stop_price)).toBe(44);
  });

  it('reconcile vangt een broker-fout per symbool af en gaat door', async () => {
    const level = { v: 40 };
    const book = realBook(m5Cfg!, { QLD: pos(10), BIL: pos(5, 91) });
    const { fake, broker } = setup(m5Cfg!, book);
    fake.seedPosition('QLD', 10);
    fake.seedPosition('BIL', 5);
    const realPlace = fake.placeOrder.bind(fake);
    fake.placeOrder = async (o) => {
      if (o.symbol === 'QLD') throw new Error('Alpaca POST x: 500 boom');
      return realPlace(o);
    };
    const r = await reconcileDisasterStops({
      date: '2024-06-03', cfgs: [m5Cfg!], books: { [m5Cfg!.id]: book }, hooks: fixedStop(m5Hooks, level),
      barsBySymbol: {}, broker,
    });
    expect(r.failed.some((x) => x.includes('QLD'))).toBe(true);
    expect(fake.openStops('BIL')).toHaveLength(1);
  });

  it('client_order_id van een stop is uniek over processen heen', () => {
    const a = stopClientOrderId('m5s-x-', 'QLD', 40, 10, 1_700_000_000_000);
    const b = stopClientOrderId('m5s-x-', 'QLD', 40, 10, 1_700_000_000_001);
    expect(a).not.toBe(b);
    expect(a.startsWith('m5s-x-QLD-')).toBe(true);
    expect(a.length).toBeLessThanOrEqual(128);
  });

  it('stop_limit-gap: limiet altijd onder de stop en positief', () => {
    expect(stopLimitPrice(60_000)).toBe(59_700);
    expect(stopLimitPrice(1)).toBeLessThan(1);
    expect(() => stopLimitPrice(0.01)).toThrow();
  });
});

describe('PR 47 blocker 3: M6-stop dekt alleen M6, niet M1', () => {
  it('stop op 0,06 BTC terwijl het account 0,1 houdt; boek blijft 0,06; M1 houdt 0,04 vrij', async () => {
    const { fake, broker, mem } = setup(m6Cfg, realBook(m6Cfg, { 'BTC/USD': pos(0.06, 60_000) }));
    fake.seedPosition('BTC/USD', 0.1); // 0,04 van M1 + 0,06 van M6
    await executeDay({
      date: '2024-06-03', cfgs: [m6Cfg], hooks: fixedStop(m6Hooks, { v: 50_000 }), lastPrice: { 'BTC/USD': 62_000 },
      broker, store: mem.store, expectReal: true,
    });
    const open = fake.openStops('BTC/USD');
    expect(open).toHaveLength(1);
    expect(Number(open[0]!.qty)).toBeCloseTo(0.06, 9);
    expect(open[0]!.type).toBe('stop_limit');
    expect(fake.available('BTC/USD')).toBeCloseTo(0.04, 9);
    expect(mem.book().positions['BTC/USD']!.qty).toBeCloseTo(0.06, 9);
  });

  it('andere sleeve op hetzelfde symbool: stop = account min andere boeken, met eigen boek als bovengrens', async () => {
    const { fake, broker, mem } = setup(m5Cfg!, realBook(m5Cfg!, { QLD: pos(10) }));
    fake.seedPosition('QLD', 12); // 10 eigen boek, maar een andere sleeve claimt er 5
    const foreignQty: ForeignQtyFn = async () => 5;
    await executeDay({
      date: '2024-06-03', cfgs: [m5Cfg!], hooks: fixedStop(m5Hooks, { v: 40 }), lastPrice: { QLD: 50 },
      broker, store: mem.store, expectReal: true, foreignQty,
    });
    expect(fake.openStops('QLD').map((o) => Number(o.qty))).toEqual([7]);
    expect(mem.book().positions.QLD!.qty).toBe(10); // nooit overschreven met broker-qty
  });
});

describe('PR 47 blocker 4: gevulde buy nooit terug in pending', () => {
  it('stop faalt na de fill: positie in boek, pending leeg, vlag stop ontbreekt; volgende dag geen tweede buy', async () => {
    const { fake, broker, mem } = setup(m5Cfg!, realBook(m5Cfg!, {}, 5_000));
    fake.prices.QLD = 50;
    fake.failStops = true;
    mem.setPending([{ symbol: 'QLD', side: 'buy', notionalUsd: 1_000, reason: 'instap' }]);
    const run = (date: string) =>
      executeDay({
        date, cfgs: [m5Cfg!], hooks: fixedStop(m5Hooks, { v: 40 }), lastPrice: { QLD: 50 },
        broker, store: mem.store, expectReal: true,
      });
    await run('2024-06-03');
    expect(fake.pos.QLD).toBe(20);
    expect(mem.book().positions.QLD!.qty).toBe(20);
    expect(mem.pending()).toHaveLength(0);
    expect(mem.book().stopMissing?.QLD).toBe('2024-06-03');

    fake.failStops = false;
    await run('2024-06-04');
    expect(fake.calls.filter((c) => c.startsWith('place market buy'))).toHaveLength(1);
    expect(fake.openStops('QLD').map((o) => Number(o.qty))).toEqual([20]);
    expect(mem.book().stopMissing?.QLD).toBeUndefined();
  });

  it('partial buy: boek volgt elke fill precies één keer', async () => {
    const { fake, broker, mem } = setup(m6Cfg, realBook(m6Cfg, {}, 10_000));
    fake.prices['BTC/USD'] = 50_000;
    fake.marketFillRatio = 0.5;
    mem.setPending([{ symbol: 'BTC/USD', side: 'buy', notionalUsd: 5_000, reason: 'instap' }]);
    const run = (date: string) =>
      executeDay({
        date, cfgs: [m6Cfg], hooks: fixedStop(m6Hooks, { v: 40_000 }), lastPrice: { 'BTC/USD': 50_000 },
        broker, store: mem.store, expectReal: true,
      });
    await run('2024-06-03');
    expect(mem.book().positions['BTC/USD']!.qty).toBeCloseTo(0.05, 9);
    fake.fillOpenMarkets(50_000);
    await run('2024-06-04');
    await run('2024-06-05');
    expect(fake.pos['BTC/USD']).toBeCloseTo(0.1, 9);
    expect(mem.book().positions['BTC/USD']!.qty).toBeCloseTo(0.1, 9);
    expect(fake.calls.filter((c) => c.startsWith('place market buy'))).toHaveLength(1);
    expect(fake.openStops('BTC/USD').map((o) => Number(o.qty))).toEqual([0.1]);
  });
});

describe('PR 47 blocker 5: blijvende partial stop-fill', () => {
  it('boek 12, stop vult 8: boek 4 en blijft 4; stop op de rest blijft staan', async () => {
    const level = { v: 40 };
    const { fake, broker, mem, prefix } = setup(m5Cfg!, realBook(m5Cfg!, { QLD: pos(12) }));
    fake.seedPosition('QLD', 12);
    await broker.setStop({ versionId: m5Cfg!.id, symbol: 'QLD', qty: 12, stopPrice: 40, stopClientPrefix: prefix });
    fake.triggerStop('QLD', 8, 40); // blijft partially_filled
    const run = (date: string) =>
      executeDay({
        date, cfgs: [m5Cfg!], hooks: fixedStop(m5Hooks, level), lastPrice: { QLD: 41 },
        broker, store: mem.store, expectReal: true,
      });
    await run('2024-06-03');
    expect(mem.book().positions.QLD!.qty).toBe(4);
    await run('2024-06-04');
    expect(mem.book().positions.QLD!.qty).toBe(4);

    const r = await reconcileDisasterStops({
      date: '2024-06-04', cfgs: [m5Cfg!], books: { [m5Cfg!.id]: mem.book() }, hooks: fixedStop(m5Hooks, level),
      barsBySymbol: {}, broker,
    });
    expect(r.cancelled).toHaveLength(0);
    const open = fake.openStops('QLD');
    expect(open).toHaveLength(1);
    expect(Number(open[0]!.qty) - Number(open[0]!.filled_qty)).toBe(4);
    expect(fake.pos.QLD).toBe(4);
  });

  it('partial stop vult later verder: alleen het nieuwe deel gaat van het boek', async () => {
    const { fake, broker, mem, prefix } = setup(m5Cfg!, realBook(m5Cfg!, { QLD: pos(12) }));
    fake.seedPosition('QLD', 12);
    await broker.setStop({ versionId: m5Cfg!.id, symbol: 'QLD', qty: 12, stopPrice: 40, stopClientPrefix: prefix });
    const run = (date: string) =>
      executeDay({
        date, cfgs: [m5Cfg!], hooks: fixedStop(m5Hooks, { v: 40 }), lastPrice: { QLD: 41 },
        broker, store: mem.store, expectReal: true,
      });
    fake.triggerStop('QLD', 8, 40);
    await run('2024-06-03');
    fake.triggerStop('QLD', 4, 39.5);
    await run('2024-06-04');
    expect(mem.book().positions.QLD).toBeUndefined();
    expect(fake.pos.QLD).toBeUndefined();
    expect(fake.openStops('QLD')).toHaveLength(0);
  });
});

describe('PR 47 blocker 6: terug naar schaduw met een papierboek', () => {
  it('schaduw-execute schrijft niets in het papierboek en plaatst niets', async () => {
    const real = realBook(m5Cfg!, { QLD: pos(10) });
    const { fake, broker, mem } = setup(m5Cfg!, real);
    mem.setPending([{ symbol: 'BIL', side: 'buy', notionalUsd: 1_000, reason: 'schaduw' }]);
    await executeDay({
      date: '2024-06-03', cfgs: [m5Cfg!], hooks: fixedStop(m5Hooks, { v: 40 }), lastPrice: { BIL: 91, QLD: 50 },
      broker, store: mem.store, expectReal: false,
    });
    expect(mem.book()).toEqual(real);
    expect(fake.calls).toHaveLength(0);
    expect(mem.decisions.some((d) => d.kind === 'skip' && /schaduw/.test(d.detail))).toBe(true);
  });

  it('schaduw-decide raakt het papierboek niet aan', async () => {
    const real = realBook(m5Cfg!, { QLD: pos(10) });
    const mem = memStore(real);
    const bars = { QQQ: makeBars(260, 300, 0.001, 0.01), QLD: makeBars(260, 50, 0.002, 0.02), BIL: makeBars(260, 91, 0, 0), SPY: makeBars(260, 400, 0.001, 0.01) };
    const date = bars.SPY.at(-1)!.t.slice(0, 10);
    await decideDay({ date, cfgs: [m5Cfg!], hooks: m5Hooks, barsBySymbol: bars, benchmark: bars.SPY, store: mem.store, expectReal: false });
    expect(mem.book()).toEqual(real);
    expect(mem.pending()).toHaveLength(0);
  });

  it('papier-execute op een schaduwboek doet niets', async () => {
    const shadow = newBook(m5Cfg!, '2024-01-01', 100);
    shadow.positions.QLD = pos(50);
    const { fake, broker, mem } = setup(m5Cfg!, shadow);
    mem.setPending([{ symbol: 'QLD', side: 'sell', qty: 50, reason: 'exit' }]);
    await executeDay({
      date: '2024-06-03', cfgs: [m5Cfg!], hooks: fixedStop(m5Hooks, { v: 40 }), lastPrice: { QLD: 50 },
      broker, store: mem.store, expectReal: true,
    });
    expect(fake.calls).toHaveLength(0);
    expect(mem.book()).toEqual(shadow);
  });
});
