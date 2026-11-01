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
import { decideDay, executeDay, hasMissingStops, repairMissingStops, type DecisionRecord, type ForeignQtyFn, type Store } from './live';
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

describe('PR 47 ronde 2 (review 5a93422): B1 pending_cancel', () => {
  it('exit terwijl de stop-cancel ~15 s in pending_cancel blijft: positie verkocht, ook na settle geen naakte positie', async () => {
    const { fake, broker, mem, prefix } = setup(m5Cfg!, realBook(m5Cfg!, { QLD: pos(20) }));
    fake.seedPosition('QLD', 20);
    fake.prices.QLD = 55;
    await broker.setStop({ versionId: m5Cfg!.id, symbol: 'QLD', qty: 20, stopPrice: 42, stopClientPrefix: prefix });
    fake.cancelHangPolls = 30;
    mem.setPending([{ symbol: 'QLD', side: 'sell', qty: 20, reason: 'exit' }]);
    await executeDay({
      date: '2024-06-03', cfgs: [m5Cfg!], hooks: fixedStop(m5Hooks, { v: 42 }), lastPrice: { QLD: 55 },
      broker, store: mem.store, expectReal: true,
    });
    fake.settle();
    expect(fake.pos.QLD).toBeUndefined();
    expect(mem.book().positions.QLD).toBeUndefined();
  });

  it('cancel blijft langer hangen dan we wachten: oude stop blijft de reservering houden, gat wordt gemarkeerd', async () => {
    const { fake, broker, mem, prefix } = setup(m5Cfg!, realBook(m5Cfg!, { QLD: pos(20) }));
    fake.seedPosition('QLD', 20);
    await broker.setStop({ versionId: m5Cfg!.id, symbol: 'QLD', qty: 20, stopPrice: 42, stopClientPrefix: prefix });
    fake.cancelHangPolls = 10_000;
    mem.setPending([{ symbol: 'QLD', side: 'sell', qty: 20, reason: 'exit' }]);
    await executeDay({
      date: '2024-06-03', cfgs: [m5Cfg!], hooks: fixedStop(m5Hooks, { v: 42 }), lastPrice: { QLD: 55 },
      broker, store: mem.store, expectReal: true,
    });
    expect(fake.calls.filter((c) => c.startsWith('place market sell'))).toHaveLength(0);
    expect(mem.pending()).toHaveLength(1); // exit blijft staan
    expect(mem.book().stopMissing?.QLD).toBe('2024-06-03'); // zichtbaar voor de volgende run en het startscherm
  });
});

describe('PR 47 ronde 2: B2 onbekende orderstatus', () => {
  it('buy gevuld, GET geeft eenmalig 503: fill in boek met stop, geen tweede buy de dag erna', async () => {
    const { fake, broker, mem } = setup(m5Cfg!, realBook(m5Cfg!, {}, 5_000));
    fake.prices.QLD = 50;
    mem.setPending([{ symbol: 'QLD', side: 'buy', notionalUsd: 1_000, reason: 'instap' }]);
    fake.getFails = 1;
    const run = (date: string) =>
      executeDay({
        date, cfgs: [m5Cfg!], hooks: fixedStop(m5Hooks, { v: 40 }), lastPrice: { QLD: 50 },
        broker, store: mem.store, expectReal: true,
      });
    await run('2024-06-03');
    await run('2024-06-04');
    expect(fake.pos.QLD).toBe(20);
    expect(mem.book().positions.QLD!.qty).toBe(20);
    expect(fake.openStops('QLD').map((o) => Number(o.qty))).toEqual([20]);
    expect(fake.calls.filter((c) => c.startsWith('place market buy'))).toHaveLength(1);
  });

  it('buy: alle GET-polls falen: order wordt gevolgd, niet opnieuw geplaatst; volgende run boekt de fill', async () => {
    const { fake, broker, mem } = setup(m5Cfg!, realBook(m5Cfg!, {}, 5_000));
    fake.prices.QLD = 50;
    mem.setPending([{ symbol: 'QLD', side: 'buy', notionalUsd: 1_000, reason: 'instap' }]);
    fake.getFails = 1_000;
    const realPlace = fake.placeOrder.bind(fake);
    fake.placeOrder = async (o) => ({ ...(await realPlace(o)), status: 'accepted', filled_qty: '0', filled_avg_price: null });
    const run = (date: string) =>
      executeDay({
        date, cfgs: [m5Cfg!], hooks: fixedStop(m5Hooks, { v: 40 }), lastPrice: { QLD: 50 },
        broker, store: mem.store, expectReal: true,
      });
    await run('2024-06-03');
    expect(mem.pending()).toHaveLength(0);
    expect(Object.keys(mem.book().openOrders ?? {})).toHaveLength(1);
    fake.getFails = 0;
    mem.setPending([{ symbol: 'QLD', side: 'buy', notionalUsd: 1_000, reason: 'decide plant opnieuw' }]);
    await run('2024-06-04');
    expect(fake.calls.filter((c) => c.startsWith('place market buy'))).toHaveLength(1);
    expect(mem.book().positions.QLD!.qty).toBe(20);
    expect(fake.openStops('QLD').map((o) => Number(o.qty))).toEqual([20]);
  });

  it('plaatsen gaf een timeout maar de order staat er: opzoeken op client_order_id, niet dubbel', async () => {
    const { fake, broker, mem } = setup(m5Cfg!, realBook(m5Cfg!, {}, 5_000));
    fake.prices.QLD = 50;
    const realPlace = fake.placeOrder.bind(fake);
    fake.placeOrder = async (o) => {
      await realPlace(o);
      if (o.type === 'market') throw new Error('The operation was aborted due to timeout');
      return realPlace(o);
    };
    mem.setPending([{ symbol: 'QLD', side: 'buy', notionalUsd: 1_000, reason: 'instap' }]);
    await executeDay({
      date: '2024-06-03', cfgs: [m5Cfg!], hooks: fixedStop(m5Hooks, { v: 40 }), lastPrice: { QLD: 50 },
      broker, store: mem.store, expectReal: true,
    });
    expect(fake.calls.filter((c) => c.startsWith('place market buy'))).toHaveLength(1);
    expect(mem.book().positions.QLD!.qty).toBe(20);
    expect(mem.pending()).toHaveLength(0);
  });
});

describe('PR 47 ronde 2: crypto-fee en PATCH-regels', () => {
  it('M6 boekt wat er echt binnenkwam (fee van de coin af); stop dekt nooit M1-stukken', async () => {
    const { fake, broker, mem } = setup(m6Cfg, realBook(m6Cfg, {}, 10_000));
    fake.seedPosition('BTC/USD', 0.04); // M1
    fake.prices['BTC/USD'] = 50_000;
    fake.cryptoFee = 0.0025;
    mem.setPending([{ symbol: 'BTC/USD', side: 'buy', notionalUsd: 3_000, reason: 'breakout' }]);
    await executeDay({
      date: '2024-06-03', cfgs: [m6Cfg], hooks: fixedStop(m6Hooks, { v: 45_000 }), lastPrice: { 'BTC/USD': 50_000 },
      broker, store: mem.store, expectReal: true, foreignQty: async () => 0,
    });
    const m6Real = 0.06 * (1 - 0.0025);
    expect(mem.book().positions['BTC/USD']!.qty).toBeCloseTo(m6Real, 9);
    expect(mem.book().cash).toBeCloseTo(10_000 - 3_000, 6); // de kas betaalt de hele fill
    expect(Number(fake.openStops('BTC/USD')[0]!.qty)).toBeCloseTo(m6Real, 9);
    expect(fake.available('BTC/USD')).toBeCloseTo(0.04, 9);
  });

  it('crypto-stop trailt: prijs omhoog bij gelijke fractionele qty gaat via PATCH zonder qty', async () => {
    const { fake, broker, prefix } = setup(m6Cfg, realBook(m6Cfg, { 'BTC/USD': pos(0.06, 50_000) }));
    fake.seedPosition('BTC/USD', 0.06);
    await broker.setStop({ versionId: m6Cfg.id, symbol: 'BTC/USD', qty: 0.06, stopPrice: 40_000, stopClientPrefix: prefix });
    await broker.setStop({ versionId: m6Cfg.id, symbol: 'BTC/USD', qty: 0.06, stopPrice: 45_000, stopClientPrefix: prefix });
    const open = fake.openStops('BTC/USD');
    expect(open.map((o) => [Number(o.qty), Number(o.stop_price)])).toEqual([[0.06, 45_000]]);
    expect(fake.calls.some((c) => c.startsWith('replace') && c.includes('qty=undefined'))).toBe(true);
  });

  it('fractionele qty-wijziging: annuleren (bevestigd) en opnieuw plaatsen, nooit twee of nul stops', async () => {
    const { fake, broker, prefix } = setup(m6Cfg, realBook(m6Cfg, { 'BTC/USD': pos(0.08, 50_000) }));
    fake.seedPosition('BTC/USD', 0.08);
    await broker.setStop({ versionId: m6Cfg.id, symbol: 'BTC/USD', qty: 0.06, stopPrice: 40_000, stopClientPrefix: prefix });
    await broker.setStop({ versionId: m6Cfg.id, symbol: 'BTC/USD', qty: 0.08, stopPrice: 40_000, stopClientPrefix: prefix });
    expect(fake.openStops('BTC/USD').map((o) => Number(o.qty))).toEqual([0.08]);
  });

  it('stop "accepted" (buiten de sessie): geen PATCH, maar annuleren en opnieuw; altijd een stop', async () => {
    const { fake, broker, prefix } = setup(m5Cfg!, realBook(m5Cfg!, { QLD: pos(20) }));
    fake.seedPosition('QLD', 20);
    fake.stopStatus = 'accepted';
    await broker.setStop({ versionId: m5Cfg!.id, symbol: 'QLD', qty: 20, stopPrice: 30, stopClientPrefix: prefix });
    await broker.setStop({ versionId: m5Cfg!.id, symbol: 'QLD', qty: 20, stopPrice: 35, stopClientPrefix: prefix });
    expect(fake.openStops('QLD').map((o) => [Number(o.qty), Number(o.stop_price)])).toEqual([[20, 35]]);
    expect(fake.calls.some((c) => c.startsWith('replace'))).toBe(false);
  });

  it('exit met gedeeltelijke day-sell die expireert: rest krijgt een stop en de exit staat de volgende run weer klaar', async () => {
    const { fake, broker, mem, prefix } = setup(m5Cfg!, realBook(m5Cfg!, { QLD: pos(10) }));
    fake.seedPosition('QLD', 10);
    await broker.setStop({ versionId: m5Cfg!.id, symbol: 'QLD', qty: 10, stopPrice: 40, stopClientPrefix: prefix });
    fake.marketFillRatio = 0.6; // rest blijft open
    mem.setPending([{ symbol: 'QLD', side: 'sell', qty: 10, reason: 'exit' }]);
    const run = (date: string) =>
      executeDay({
        date, cfgs: [m5Cfg!], hooks: fixedStop(m5Hooks, { v: 40 }), lastPrice: { QLD: 48 },
        broker, store: mem.store, expectReal: true,
      });
    await run('2024-06-03');
    expect(mem.book().positions.QLD!.qty).toBe(4);
    // dag voorbij: de rest van de day-order expireert
    for (const o of fake.orders_) if (o.type === 'market' && o.status === 'partially_filled') o.status = 'expired';
    fake.marketFillRatio = 1;
    await run('2024-06-04');
    expect(fake.pos.QLD).toBeUndefined();
    expect(mem.book().positions.QLD).toBeUndefined();
  });
});

describe('PR 47 ronde 2: replace in overgang', () => {
  it('reconcile annuleert niets terwijl een stop in pending_replace staat', async () => {
    const book = realBook(m5Cfg!, { QLD: pos(20) });
    const { fake, broker, prefix } = setup(m5Cfg!, book);
    fake.seedPosition('QLD', 20);
    await broker.setStop({ versionId: m5Cfg!.id, symbol: 'QLD', qty: 20, stopPrice: 40, stopClientPrefix: prefix });
    fake.orders_[0]!.status = 'pending_replace';
    await fake.placeOrder({ symbol: 'QLD', qty: 0.000001, side: 'buy', type: 'market', time_in_force: 'day', client_order_id: 'noop' });
    const r = await reconcileDisasterStops({
      date: '2024-06-03', cfgs: [m5Cfg!], books: { [m5Cfg!.id]: book }, hooks: fixedStop(m5Hooks, { v: 44 }),
      barsBySymbol: {}, broker,
    });
    expect(r.deduped).toHaveLength(0);
    expect(fake.calls.filter((c) => c.startsWith('cancel'))).toHaveLength(0);
  });
});

describe('PR 47 ronde 3 (review Dave op 9fc1954c)', () => {
  /** Plaatsing komt aan bij Alpaca, maar het antwoord gaat verloren; opzoeken toont hem pas na `lag` keer. */
  function lostReply(fake: FakeAlpaca, lag: number) {
    const place = fake.placeOrder.bind(fake);
    let first = true;
    fake.placeOrder = async (r) => {
      const x = await place(r);
      if (r.type === 'market' && first) { first = false; throw new Error('socket hang up (ETIMEDOUT)'); }
      return x;
    };
    const byCid = fake.getOrderByClientOrderId.bind(fake);
    fake.getOrderByClientOrderId = async (c) => (lag-- > 0 ? null : byCid(c));
  }
  const day = (cfg: VersionConfig, broker: ReturnType<typeof makeAlpacaPaperBroker>, mem: ReturnType<typeof memStore>, date: string, px: number) =>
    executeDay({ date, cfgs: [cfg], hooks: fixedStop(m5Hooks, { v: 40 }), lastPrice: { QLD: px }, broker, store: mem.store, expectReal: true });

  it('B3: buy-POST time-out en order nog onzichtbaar: geen tweede buy, fill in het boek met stop', async () => {
    const { fake, broker, mem } = setup(m5Cfg!, realBook(m5Cfg!, {}, 5_000));
    fake.prices.QLD = 50;
    lostReply(fake, 1);
    mem.setPending([{ symbol: 'QLD', side: 'buy', notionalUsd: 1000, reason: 'in' }]);
    await day(m5Cfg!, broker, mem, '2024-06-03', 50);
    await day(m5Cfg!, broker, mem, '2024-06-04', 50);
    const buys = fake.orders_.filter((o) => o.type === 'market' && o.side === 'buy');
    expect(buys).toHaveLength(1);
    expect(fake.pos.QLD).toBe(20);
    expect(mem.book().positions.QLD?.qty).toBe(20);
    expect(fake.openStops('QLD').reduce((s, o) => s + Number(o.qty), 0)).toBe(20);
  });

  it('B3: order dagenlang onzichtbaar: volgen, en pas opnieuw plaatsen met dezelfde client_order_id (geen dubbele)', async () => {
    const { fake, broker, mem } = setup(m5Cfg!, realBook(m5Cfg!, {}, 5_000));
    fake.prices.QLD = 50;
    lostReply(fake, 3); // plaatsen, eind run 1, begin run 2: onzichtbaar
    mem.setPending([{ symbol: 'QLD', side: 'buy', notionalUsd: 1000, reason: 'in' }]);
    await day(m5Cfg!, broker, mem, '2024-06-03', 50);
    expect(Object.keys(mem.book().openOrders ?? {})).toHaveLength(1);
    await day(m5Cfg!, broker, mem, '2024-06-04', 50); // niet gevonden: opnieuw met dezelfde id -> 422 -> bestaande volgen
    const buys = fake.orders_.filter((o) => o.type === 'market' && o.side === 'buy');
    expect(buys).toHaveLength(1);
    expect(fake.pos.QLD).toBe(20);
    expect(mem.book().positions.QLD?.qty).toBe(20);
    expect(fake.openStops('QLD').reduce((s, o) => s + Number(o.qty), 0)).toBe(20);
  });

  it('B3: buy die echt nooit aankwam gaat na de volgende run gewoon door, één keer', async () => {
    const { fake, broker, mem } = setup(m5Cfg!, realBook(m5Cfg!, {}, 5_000));
    fake.prices.QLD = 50;
    const place = fake.placeOrder.bind(fake);
    let drop = true;
    fake.placeOrder = async (r) => {
      if (r.type === 'market' && drop) { drop = false; throw new Error('ECONNRESET'); } // niets geplaatst
      return place(r);
    };
    mem.setPending([{ symbol: 'QLD', side: 'buy', notionalUsd: 1000, reason: 'in' }]);
    await day(m5Cfg!, broker, mem, '2024-06-03', 50);
    expect(fake.pos.QLD ?? 0).toBe(0);
    await day(m5Cfg!, broker, mem, '2024-06-04', 50);
    expect(fake.orders_.filter((o) => o.type === 'market' && o.side === 'buy')).toHaveLength(1);
    expect(fake.pos.QLD).toBe(20);
    expect(mem.book().positions.QLD?.qty).toBe(20);
  });

  it('B3 sell-variant: sell-POST time-out en onzichtbaar: geen tweede sell, nooit short', async () => {
    const { fake, broker, mem, prefix } = setup(m5Cfg!, realBook(m5Cfg!, { QLD: pos(20) }));
    fake.seedPosition('QLD', 20);
    fake.prices.QLD = 55;
    await broker.setStop({ versionId: m5Cfg!.id, symbol: 'QLD', qty: 20, stopPrice: 40, stopClientPrefix: prefix });
    lostReply(fake, 1);
    mem.setPending([{ symbol: 'QLD', side: 'sell', qty: 20, reason: 'exit' }]);
    await day(m5Cfg!, broker, mem, '2024-06-03', 55);
    await day(m5Cfg!, broker, mem, '2024-06-04', 55);
    expect(fake.orders_.filter((o) => o.type === 'market' && o.side === 'sell')).toHaveLength(1);
    expect(fake.pos.QLD ?? 0).toBe(0);
    expect(mem.book().positions.QLD).toBeUndefined();
    expect(fake.openStops('QLD')).toHaveLength(0);
  });

  it('B4: wachttijd per run is begrensd (budget), ook als een cancel minuten hangt', async () => {
    const fake = new FakeAlpaca();
    let waited = 0;
    const broker = makeAlpacaPaperBroker(fake, { sleep: async (ms) => { waited += ms; }, waitBudgetMs: 10_000 });
    const mem = memStore(realBook(m5Cfg!, { QLD: pos(20) }));
    const prefix = momentumStopClientPrefix(m5Cfg!);
    fake.seedPosition('QLD', 20);
    fake.prices.QLD = 55;
    await broker.setStop({ versionId: m5Cfg!.id, symbol: 'QLD', qty: 20, stopPrice: 40, stopClientPrefix: prefix });
    fake.cancelHangPolls = 10_000;
    mem.setPending([{ symbol: 'QLD', side: 'sell', qty: 20, reason: 'exit' }]);
    await day(m5Cfg!, broker, mem, '2024-06-03', 55);
    expect(waited).toBeLessThanOrEqual(10_000);
    expect(mem.pending()).toHaveLength(1); // exit blijft staan
    expect(fake.pos.QLD).toBe(20); // niets verkocht, de hangende stop houdt de stukken nog vast
  });

  it('B1-rest: cancel hangt langer dan de run mag wachten en gaat daarna door: de stopwacht zet de stop terug', async () => {
    const fake = new FakeAlpaca();
    const broker = makeAlpacaPaperBroker(fake, { sleep: noSleep, waitBudgetMs: 5_000 });
    const mem = memStore(realBook(m5Cfg!, { QLD: pos(20) }));
    const prefix = momentumStopClientPrefix(m5Cfg!);
    fake.seedPosition('QLD', 20);
    fake.prices.QLD = 55;
    await broker.setStop({ versionId: m5Cfg!.id, symbol: 'QLD', qty: 20, stopPrice: 40, stopClientPrefix: prefix });
    fake.cancelHangPolls = 10_000;
    mem.setPending([{ symbol: 'QLD', side: 'sell', qty: 20, reason: 'exit' }]);
    await day(m5Cfg!, broker, mem, '2024-06-03', 55);
    expect(mem.book().stopMissing?.QLD).toBeDefined();
    fake.settle(); // de cancel gaat alsnog door: nu staat de positie zonder stop
    expect(fake.openStops('QLD')).toHaveLength(0);

    // volgende tick (5 min later), nieuwe broker met vers budget
    const next = makeAlpacaPaperBroker(fake, { sleep: noSleep });
    const r = await repairMissingStops({ date: '2024-06-03', cfgs: [m5Cfg!], hooks: fixedStop(m5Hooks, { v: 40 }), broker: next, store: mem.store });
    expect(r.repaired).toEqual([`${m5Cfg!.id}:QLD`]);
    expect(fake.openStops('QLD').reduce((s, o) => s + Number(o.qty), 0)).toBe(20);
    expect(mem.book().stopMissing?.QLD).toBeUndefined();
  });

  it('stopwacht doet niets bij een schaduwboek of zonder gemarkeerde stop', async () => {
    const fake = new FakeAlpaca();
    const broker = makeAlpacaPaperBroker(fake, { sleep: noSleep });
    const b = realBook(m5Cfg!, { QLD: pos(20) });
    const mem = memStore(b);
    expect((await repairMissingStops({ date: '2024-06-03', cfgs: [m5Cfg!], hooks: m5Hooks, broker, store: mem.store })).repaired).toEqual([]);
    const shadow = memStore({ ...b, real: false, stopMissing: { QLD: '2024-06-03' } });
    expect((await repairMissingStops({ date: '2024-06-03', cfgs: [m5Cfg!], hooks: m5Hooks, broker, store: shadow.store })).repaired).toEqual([]);
    expect(fake.calls.filter((c) => !c.startsWith('GET'))).toEqual([]);
  });
});

describe('PR 47 ronde 4 (review Dave op 27a88a2): B5 stopwacht verwerkt open buys en cid-markers', () => {
  const guard = (cfg: VersionConfig, fake: FakeAlpaca, mem: ReturnType<typeof memStore>, date = '2024-06-03') =>
    repairMissingStops({
      date, cfgs: [cfg], hooks: fixedStop(m5Hooks, { v: 40 }),
      broker: makeAlpacaPaperBroker(fake, { sleep: noSleep }), store: mem.store,
    });
  const stopQty = (fake: FakeAlpaca) => fake.openStops('QLD').reduce((s, o) => s + Number(o.qty), 0);

  it('W5: buy van 20 vult 10, de rest vult na de run: de stopwacht boekt de rest en zet de stop op 20, nog dezelfde dag', async () => {
    const { fake, broker, mem } = setup(m5Cfg!, realBook(m5Cfg!, {}, 5_000));
    fake.prices.QLD = 50;
    fake.marketFillRatio = 0.5;
    mem.setPending([{ symbol: 'QLD', side: 'buy', notionalUsd: 1000, reason: 'in' }]);
    await executeDay({
      date: '2024-06-03', cfgs: [m5Cfg!], hooks: fixedStop(m5Hooks, { v: 40 }), lastPrice: { QLD: 50 },
      broker, store: mem.store, expectReal: true,
    });
    expect(mem.book().positions.QLD?.qty).toBe(10);
    expect(stopQty(fake)).toBe(10);
    expect(Object.keys(mem.book().openOrders ?? {})).toHaveLength(1);
    expect(await hasMissingStops([m5Cfg!], mem.store)).toBe(true); // open buy = werk voor de wacht

    fake.fillOpenMarkets(50); // de rest vult buiten de run om
    const r = await guard(m5Cfg!, fake, mem);
    expect(r.failed).toEqual([]);
    expect(fake.pos.QLD).toBe(20);
    expect(mem.book().positions.QLD?.qty).toBe(20);
    expect(stopQty(fake)).toBe(20);
    expect(fake.openStops('QLD')).toHaveLength(1);
    expect(mem.book().stopMissing?.QLD).toBeUndefined();
    expect(Object.keys(mem.book().openOrders ?? {})).toHaveLength(0);
    expect(await hasMissingStops([m5Cfg!], mem.store)).toBe(false);
  });

  it('W5: idempotent, een tweede en derde wacht boeken niets dubbel en plaatsen geen tweede stop', async () => {
    const { fake, broker, mem } = setup(m5Cfg!, realBook(m5Cfg!, {}, 5_000));
    fake.prices.QLD = 50;
    fake.marketFillRatio = 0.5;
    mem.setPending([{ symbol: 'QLD', side: 'buy', notionalUsd: 1000, reason: 'in' }]);
    await executeDay({
      date: '2024-06-03', cfgs: [m5Cfg!], hooks: fixedStop(m5Hooks, { v: 40 }), lastPrice: { QLD: 50 },
      broker, store: mem.store, expectReal: true,
    });
    fake.fillOpenMarkets(50);
    await guard(m5Cfg!, fake, mem);
    await guard(m5Cfg!, fake, mem);
    await Promise.all([guard(m5Cfg!, fake, mem), guard(m5Cfg!, fake, mem)]);
    expect(mem.book().positions.QLD?.qty).toBe(20);
    expect(mem.book().cash).toBeCloseTo(4_000, 6);
    expect(fake.openStops('QLD')).toHaveLength(1);
    expect(stopQty(fake)).toBe(20);
    // en de volgende executeDay koopt niets en boekt niets opnieuw
    await executeDay({
      date: '2024-06-04', cfgs: [m5Cfg!], hooks: fixedStop(m5Hooks, { v: 40 }), lastPrice: { QLD: 50 },
      broker, store: mem.store, expectReal: true,
    });
    expect(fake.orders_.filter((o) => o.type === 'market' && o.side === 'buy')).toHaveLength(1);
    expect(mem.book().positions.QLD?.qty).toBe(20);
    expect(stopQty(fake)).toBe(20);
  });

  it('W5: buy nog niet gevuld bij de wacht: niets geboekt, niets geplaatst, marker blijft', async () => {
    const { fake, broker, mem } = setup(m5Cfg!, realBook(m5Cfg!, {}, 5_000));
    fake.prices.QLD = 50;
    fake.marketFillRatio = 0;
    mem.setPending([{ symbol: 'QLD', side: 'buy', notionalUsd: 1000, reason: 'in' }]);
    await executeDay({
      date: '2024-06-03', cfgs: [m5Cfg!], hooks: fixedStop(m5Hooks, { v: 40 }), lastPrice: { QLD: 50 },
      broker, store: mem.store, expectReal: true,
    });
    const before = fake.calls.filter((c) => c.startsWith('place')).length;
    await guard(m5Cfg!, fake, mem);
    expect(fake.calls.filter((c) => c.startsWith('place')).length).toBe(before);
    expect(mem.book().positions.QLD).toBeUndefined();
    expect(Object.keys(mem.book().openOrders ?? {})).toHaveLength(1);
  });

  it('timeout-variant: buy-POST time-out met lege lookup, order vult later: de wacht boekt hem en zet de stop, geen tweede buy', async () => {
    const { fake, broker, mem } = setup(m5Cfg!, realBook(m5Cfg!, {}, 5_000));
    fake.prices.QLD = 50;
    const place = fake.placeOrder.bind(fake);
    let first = true;
    fake.placeOrder = async (r) => {
      const x = await place(r);
      if (r.type === 'market' && first) { first = false; throw new Error('socket hang up (ETIMEDOUT)'); }
      return x;
    };
    const byCid = fake.getOrderByClientOrderId.bind(fake);
    let visible = false;
    fake.getOrderByClientOrderId = async (c) => (visible ? byCid(c) : null);

    mem.setPending([{ symbol: 'QLD', side: 'buy', notionalUsd: 1000, reason: 'in' }]);
    await executeDay({
      date: '2024-06-03', cfgs: [m5Cfg!], hooks: fixedStop(m5Hooks, { v: 40 }), lastPrice: { QLD: 50 },
      broker, store: mem.store, expectReal: true,
    });
    // onzichtbaar: alleen een cid-marker in het boek, geen positie, geen stop
    expect(mem.book().positions.QLD).toBeUndefined();
    expect(Object.keys(mem.book().openOrders ?? {})[0]).toMatch(/^cid:/);
    expect(fake.openStops('QLD')).toHaveLength(0);
    expect(await hasMissingStops([m5Cfg!], mem.store)).toBe(true);

    // nog onzichtbaar: de wacht doet niets en plaatst nooit een order
    const r0 = await guard(m5Cfg!, fake, mem);
    expect(r0.repaired).toEqual([]);
    expect(fake.orders_.filter((o) => o.type === 'market' && o.side === 'buy')).toHaveLength(1);
    expect(Object.keys(mem.book().openOrders ?? {})).toHaveLength(1);

    // de order wordt zichtbaar (hij was al gevuld): binnen één tick in het boek, met stop op de volle stand
    visible = true;
    const r1 = await guard(m5Cfg!, fake, mem);
    expect(r1.failed).toEqual([]);
    expect(mem.book().positions.QLD?.qty).toBe(20);
    expect(stopQty(fake)).toBe(20);
    expect(mem.book().stopMissing?.QLD).toBeUndefined();
    expect(Object.keys(mem.book().openOrders ?? {})).toHaveLength(0);
    expect(fake.orders_.filter((o) => o.type === 'market' && o.side === 'buy')).toHaveLength(1);

    // en de volgende handelsdag koopt niet opnieuw
    await executeDay({
      date: '2024-06-04', cfgs: [m5Cfg!], hooks: fixedStop(m5Hooks, { v: 40 }), lastPrice: { QLD: 50 },
      broker, store: mem.store, expectReal: true,
    });
    expect(fake.orders_.filter((o) => o.type === 'market' && o.side === 'buy')).toHaveLength(1);
    expect(mem.book().positions.QLD?.qty).toBe(20);
  });

  it('GET-fout op de orderstatus: de wacht slaat over en probeert het de volgende tick opnieuw', async () => {
    const { fake, broker, mem } = setup(m5Cfg!, realBook(m5Cfg!, {}, 5_000));
    fake.prices.QLD = 50;
    fake.marketFillRatio = 0.5;
    mem.setPending([{ symbol: 'QLD', side: 'buy', notionalUsd: 1000, reason: 'in' }]);
    await executeDay({
      date: '2024-06-03', cfgs: [m5Cfg!], hooks: fixedStop(m5Hooks, { v: 40 }), lastPrice: { QLD: 50 },
      broker, store: mem.store, expectReal: true,
    });
    fake.fillOpenMarkets(50);
    const get = fake.getOrder.bind(fake);
    let boom = true;
    fake.getOrder = async (id) => { if (boom) throw new Error('503 service unavailable'); return get(id); };
    await guard(m5Cfg!, fake, mem);
    expect(mem.book().positions.QLD?.qty).toBe(10);
    boom = false;
    await guard(m5Cfg!, fake, mem);
    expect(mem.book().positions.QLD?.qty).toBe(20);
    expect(stopQty(fake)).toBe(20);
  });

  it('stopwacht negeert een open buy in een schaduwboek', async () => {
    const b = realBook(m5Cfg!, {});
    b.real = false;
    b.openOrders = { x1: { symbol: 'QLD', side: 'buy', reason: 'in' } };
    const mem = memStore(b);
    const fake = new FakeAlpaca();
    expect(await hasMissingStops([m5Cfg!], mem.store)).toBe(false);
    await guard(m5Cfg!, fake, mem);
    expect(fake.calls.filter((c) => !c.startsWith('GET'))).toEqual([]);
  });
});

describe('PR 47 ronde 4, extra randgevallen', () => {
  function lostReply(fake: FakeAlpaca, lag: number) {
    const place = fake.placeOrder.bind(fake);
    let first = true;
    fake.placeOrder = async (r) => {
      const x = await place(r);
      if (r.type === 'market' && first) { first = false; throw new Error('socket hang up (ETIMEDOUT)'); }
      return x;
    };
    const byCid = fake.getOrderByClientOrderId.bind(fake);
    fake.getOrderByClientOrderId = async (c) => (lag-- > 0 ? null : byCid(c));
  }
  const day = (cfg: VersionConfig, broker: ReturnType<typeof makeAlpacaPaperBroker>, mem: ReturnType<typeof memStore>, date: string, px: number) =>
    executeDay({ date, cfgs: [cfg], hooks: fixedStop(m5Hooks, { v: 40 }), lastPrice: { QLD: px }, broker, store: mem.store, expectReal: true });

  it('B5 extra (Cosmo-thread): W5: buy vult deels in de run, de rest daarna: de stopwacht zet de stop binnen een tick op de volle stand', async () => {
    const { fake, broker, mem } = setup(m5Cfg!, realBook(m5Cfg!, {}, 5_000));
    fake.prices.QLD = 50;
    fake.marketFillRatio = 0.5; // 10 van 20 meteen, rest blijft open
    mem.setPending([{ symbol: 'QLD', side: 'buy', notionalUsd: 1000, reason: 'in' }]);
    await day(m5Cfg!, broker, mem, '2024-06-03', 50);
    expect(mem.book().positions.QLD?.qty).toBe(10);
    expect(Object.keys(mem.book().openOrders ?? {})).toHaveLength(1);
    fake.fillOpenMarkets(50); // na de run vult de rest
    expect(fake.pos.QLD).toBe(20);

    await repairMissingStops({ date: '2024-06-03', cfgs: [m5Cfg!], hooks: fixedStop(m5Hooks, { v: 40 }), broker: makeAlpacaPaperBroker(fake, { sleep: noSleep }), store: mem.store });
    expect(mem.book().positions.QLD?.qty).toBe(20);
    expect(fake.openStops('QLD').reduce((s, o) => s + Number(o.qty), 0)).toBe(20);
    expect(mem.book().openOrders ?? {}).toEqual({});
    // nog een tick: niets dubbel (fill één keer in het boek, één stop)
    await repairMissingStops({ date: '2024-06-03', cfgs: [m5Cfg!], hooks: fixedStop(m5Hooks, { v: 40 }), broker: makeAlpacaPaperBroker(fake, { sleep: noSleep }), store: mem.store });
    expect(mem.book().positions.QLD?.qty).toBe(20);
    expect(fake.openStops('QLD')).toHaveLength(1);
    expect(fake.orders_.filter((o) => o.type === 'market')).toHaveLength(1);
  });

  it('B5 extra: timeout-variant: buy-POST time-out, de hele run onzichtbaar, later gevuld: de stopwacht boekt hem en zet de stop', async () => {
    const { fake, broker, mem } = setup(m5Cfg!, realBook(m5Cfg!, {}, 5_000));
    fake.prices.QLD = 50;
    lostReply(fake, 2); // bij plaatsen en aan het eind van de run nog onzichtbaar
    mem.setPending([{ symbol: 'QLD', side: 'buy', notionalUsd: 1000, reason: 'in' }]);
    await day(m5Cfg!, broker, mem, '2024-06-03', 50);
    expect(mem.book().positions.QLD).toBeUndefined();
    expect(fake.pos.QLD).toBe(20); // staat wel bij de broker, zonder stop
    expect(fake.openStops('QLD')).toHaveLength(0);

    await repairMissingStops({ date: '2024-06-03', cfgs: [m5Cfg!], hooks: fixedStop(m5Hooks, { v: 40 }), broker: makeAlpacaPaperBroker(fake, { sleep: noSleep }), store: mem.store });
    expect(mem.book().positions.QLD?.qty).toBe(20);
    expect(fake.openStops('QLD').reduce((s, o) => s + Number(o.qty), 0)).toBe(20);
    expect(fake.orders_.filter((o) => o.type === 'market')).toHaveLength(1);
    expect(mem.pending()).toEqual([]);
  });

  it('stopwacht houdt een nog onzichtbare order gevolgd en plaatst nooit zelf een market order', async () => {
    const { fake, broker, mem } = setup(m5Cfg!, realBook(m5Cfg!, {}, 5_000));
    fake.prices.QLD = 50;
    lostReply(fake, 5);
    mem.setPending([{ symbol: 'QLD', side: 'buy', notionalUsd: 1000, reason: 'in' }]);
    await day(m5Cfg!, broker, mem, '2024-06-03', 50);
    await repairMissingStops({ date: '2024-06-03', cfgs: [m5Cfg!], hooks: fixedStop(m5Hooks, { v: 40 }), broker: makeAlpacaPaperBroker(fake, { sleep: noSleep }), store: mem.store });
    expect(Object.values(mem.book().openOrders ?? {}).map((m) => m.side)).toEqual(['buy']);
    expect(mem.pending()).toEqual([]); // niet terug in de rij zolang hij misschien bestaat
    expect(fake.orders_.filter((o) => o.type === 'market')).toHaveLength(1);
  });

  it('wachtbudget telt de echte tijd, ook trage HTTP-calls', async () => {
    const fake = new FakeAlpaca();
    let clock = 0;
    const slowGet = fake.getOrder.bind(fake);
    fake.getOrder = async (id) => { clock += 15_000; return slowGet(id); }; // elke GET duurt 15 s
    const broker = makeAlpacaPaperBroker(fake, { sleep: async () => {}, now: () => clock, waitBudgetMs: 45_000 });
    const prefix = momentumStopClientPrefix(m5Cfg!);
    fake.seedPosition('QLD', 20);
    await broker.setStop({ versionId: m5Cfg!.id, symbol: 'QLD', qty: 20, stopPrice: 40, stopClientPrefix: prefix });
    fake.cancelHangPolls = 10_000;
    const out = await broker.cancelStop({ versionId: m5Cfg!.id, symbol: 'QLD', stopClientPrefix: prefix });
    expect(out).toBe('timeout');
    expect(clock).toBeLessThanOrEqual(60_000); // budget plus hooguit één lopende call
  });
});
