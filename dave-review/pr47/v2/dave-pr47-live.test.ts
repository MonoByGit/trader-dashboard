/** @jest-environment node */
// Dave repro PR 47: executeDay/reconcile met een nep-broker die een echte rekening nabootst (posities + open stops).
import { executeDay, type Fill, type Store } from '../../../../src/momentum2/live';
import type { MomentumBroker } from '../../../../src/momentum2/broker-types';
import { reconcileDisasterStops, type OpenStopOrder } from '../../../../src/momentum2/reconcile-disaster-stops';
import { momentumStopClientPrefix } from '../../../../src/momentum2/order-tag';
import { newBook } from '../../../../src/momentum2/book';
import { makeBars } from '../../../../src/momentum2/fixtures';
import { m5Versions } from '../../../../src/momentum5/config';
import { m5Hooks } from '../../../../src/momentum5/plan';
import { m6Config } from '../../../../src/momentum6/config';
import { m6Hooks } from '../../../../src/momentum6/plan';
import type { OrderIntent, VersionBook } from '../../../../src/momentum2/types';

const [m5] = m5Versions(100_000);
const m6 = m6Config(100_000);

function memStore(initial?: VersionBook) {
  let book = initial ? structuredClone(initial) : null;
  let pending: OrderIntent[] = [];
  const trades: unknown[] = [];
  const store: Store = {
    loadBook: async () => (book ? structuredClone(book) : null),
    saveBook: async (b) => { book = structuredClone(b); },
    loadPending: async () => pending,
    savePending: async (_id, o) => { pending = o; },
    logEquity: async () => {},
    logTrade: async (_id, t) => { trades.push(t); },
    logDecision: async () => {},
  };
  return { store, book: () => book, pending: () => pending, trades };
}

/** Nep-rekening met Alpaca-semantiek: posities zijn account-breed (ook M1), open sell-stops reserveren stukken
 *  (qty_available = qty - held), stopFill ziet filled en partially_filled, dubbele client_order_id wordt geweigerd. */
type FStop = OpenStopOrder & { status: string; filledQty: number };
function fakeAccount(opts: { price: number; feePct?: number; setStopThrows?: boolean; stopFillsAfterCheck?: boolean }) {
  const pos: Record<string, number> = {};
  let stops: FStop[] = [];
  const ids = new Set<string>();
  const log: string[] = [];
  let checked = false;
  let n = 0;
  const held = (sym: string, exceptPrefix?: string) => stops.filter((s) => s.symbol === sym && ['new', 'partially_filled'].includes(s.status) && !(exceptPrefix && s.clientOrderId.startsWith(exceptPrefix))).reduce((a, s) => a + s.qty - s.filledQty, 0);
  const b: MomentumBroker = {
    marketOrder: async (o): Promise<Fill> => {
      if (ids.has(o.clientOrderId)) throw new Error('Alpaca 422 client_order_id must be unique');
      if (o.side === 'sell' && o.qty > (pos[o.symbol] ?? 0) - held(o.symbol) + 1e-12) throw new Error('Alpaca 403 insufficient qty available');
      ids.add(o.clientOrderId);
      const q = o.side === 'buy' ? o.qty * (1 - (opts.feePct ?? 0)) : -o.qty;
      pos[o.symbol] = +((pos[o.symbol] ?? 0) + q).toFixed(9);
      log.push(`${o.side} ${o.symbol} ${o.qty}`);
      return { orderId: o.clientOrderId, qty: o.qty, price: opts.price };
    },
    setStop: async (o) => {
      if (opts.setStopThrows) throw new Error('Alpaca 403 insufficient balance');
      const free = (pos[o.symbol] ?? 0) - held(o.symbol, `${o.stopClientPrefix}${o.symbol}-`);
      if (o.qty > free + 1e-12) throw new Error(`Alpaca 403 insufficient qty: stop ${o.qty} > vrij ${free}`);
      for (const s of stops) if (s.clientOrderId.startsWith(`${o.stopClientPrefix}${o.symbol}-`) && s.status === 'new') s.status = 'canceled';
      n += 1;
      const id = `${o.stopClientPrefix}${o.symbol}-${o.qty}-${Math.round(o.stopPrice * 100)}-${n}`;
      stops.push({ symbol: o.symbol, qty: o.qty, stopPrice: o.stopPrice, clientOrderId: id, orderId: id, status: 'new', filledQty: 0 });
      log.push(`stop ${o.symbol} ${o.qty}@${o.stopPrice}`);
    },
    cancelStop: async (o) => {
      if (opts.stopFillsAfterCheck && checked) {
        for (const s of stops) if (s.status === 'new') { s.status = 'filled'; s.filledQty = s.qty; pos[s.symbol] = (pos[s.symbol] ?? 0) - s.qty; log.push(`stopfill ${s.symbol} ${s.qty}`); }
      }
      for (const s of stops) {
        const hit = o.orderId ? s.orderId === o.orderId : s.clientOrderId.startsWith(`${o.stopClientPrefix}${o.symbol}-`);
        if (hit && ['new', 'partially_filled'].includes(s.status)) s.status = 'canceled';
      }
      log.push(`cancel ${o.symbol}`);
    },
    stopFill: async (o) => {
      checked = true;
      const s = stops.find((x) => x.clientOrderId.startsWith(`${o.stopClientPrefix}${o.symbol}-`) && ['filled', 'partially_filled', 'canceled'].includes(x.status) && x.filledQty > 0);
      return s ? { orderId: s.clientOrderId, qty: s.filledQty, price: s.stopPrice } : null;
    },
    listOpenStops: async (o) => stops.filter((s) => ['new', 'partially_filled'].includes(s.status) && s.clientOrderId.startsWith(o.stopClientPrefix)).map((s) => ({ ...s, qty: s.qty })),
    positionQty: async (o) => +((pos[o.symbol] ?? 0) - held(o.symbol)).toFixed(9),
  };
  return { b, pos, stops: () => stops, setStops: (x: FStop[]) => { stops = x; }, log };
}

const qldBars = { QLD: makeBars(60, 50, 0.01, 0.02), SPY: makeBars(60, 100, 0.001, 0.01) };

describe('PR47 executeDay met nep-rekening', () => {
  it('L1 setStop faalt na een buy-fill: de fill moet in het boek blijven (anders positie zonder stop en dubbele buy)', async () => {
    const book = newBook(m5!, '2024-01-01', 100); book.real = true; book.cash = 5000;
    const mem = memStore(book);
    await mem.store.savePending(m5!.id, [{ symbol: 'QLD', side: 'buy', notionalUsd: 1000, reason: 'in' }]);
    const acc = fakeAccount({ price: 50, setStopThrows: true });
    await executeDay({ date: '2024-06-01', cfgs: [m5!], hooks: m5Hooks, lastPrice: { QLD: 50 }, barsBySymbol: qldBars, broker: acc.b, store: mem.store }).catch(() => {});
    expect(acc.pos.QLD).toBe(20); // broker heeft 20 QLD
    expect(mem.book()!.positions.QLD?.qty ?? 0).toBe(20); // boek moet dat weten
    // L1b: tweede execute dezelfde dag (retry) mag niet opnieuw kopen
    await executeDay({ date: '2024-06-01', cfgs: [m5!], hooks: m5Hooks, lastPrice: { QLD: 50 }, barsBySymbol: qldBars, broker: acc.b, store: mem.store }).catch(() => {});
    expect(acc.pos.QLD).toBe(20);
    expect(mem.pending().filter((o) => o.side === 'buy')).toEqual([]);
  });

  it('L2 crypto fee: M6-stop qty mag niet groter zijn dan de echte positie na fee (anders weigert Alpaca de stop)', async () => {
    const book = newBook(m6, '2024-01-01', 100); book.real = true; book.cash = 10000;
    const mem = memStore(book);
    await mem.store.savePending(m6.id, [{ symbol: 'BTC/USD', side: 'buy', notionalUsd: 5000, reason: 'breakout', signalDate: '2024-05-31' }]);
    const acc = fakeAccount({ price: 50000, feePct: 0.0025 });
    let err: unknown = null;
    await executeDay({ date: '2024-06-01', cfgs: [m6], hooks: m6Hooks, lastPrice: { 'BTC/USD': 50000 }, barsBySymbol: { 'BTC/USD': makeBars(60, 50000, 0.001, 0.02) }, broker: acc.b, store: mem.store }).catch((e) => { err = e; });
    expect(err).toBeNull();
    expect(acc.stops().filter((s) => s.status === 'new').length).toBe(1);
  });

  it('L3 stop al gevuld en positie weg: geen nieuwe stop, geen verkoop in een short', async () => {
    const book = newBook(m5!, '2024-01-01', 100); book.real = true; book.cash = 0;
    book.positions.QLD = { qty: 20, entryPrice: 50, entryDate: '2024-05-01', highWater: 60 };
    const mem = memStore(book);
    await mem.store.savePending(m5!.id, [{ symbol: 'QLD', side: 'sell', qty: 20, reason: 'regime' }]);
    const acc = fakeAccount({ price: 40 });
    acc.pos.QLD = 0;
    acc.setStops([{ symbol: 'QLD', qty: 20, stopPrice: 42, clientOrderId: `${momentumStopClientPrefix(m5!)}QLD-20-4200-0`, orderId: 'x0', status: 'filled', filledQty: 20 }]);
    await executeDay({ date: '2024-06-01', cfgs: [m5!], hooks: m5Hooks, lastPrice: { QLD: 40 }, barsBySymbol: qldBars, broker: acc.b, store: mem.store });
    expect(acc.pos.QLD).toBe(0);
    expect(acc.log.filter((l) => l.startsWith('sell') || l.startsWith('stop '))).toEqual([]);
    expect(mem.book()!.positions.QLD).toBeUndefined();
  });

  it('L4 volgorde bij exit: eerst cancel, dan sell', async () => {
    const book = newBook(m5!, '2024-01-01', 100); book.real = true; book.cash = 0;
    book.positions.QLD = { qty: 20, entryPrice: 50, entryDate: '2024-05-01', highWater: 60 };
    const mem = memStore(book);
    await mem.store.savePending(m5!.id, [{ symbol: 'QLD', side: 'sell', qty: 20, reason: 'regime' }]);
    const acc = fakeAccount({ price: 55 }); acc.pos.QLD = 20;
    await executeDay({ date: '2024-06-01', cfgs: [m5!], hooks: m5Hooks, lastPrice: { QLD: 55 }, barsBySymbol: qldBars, broker: acc.b, store: mem.store });
    expect(acc.log).toEqual(['cancel QLD', 'sell QLD 20']);
  });

  it('L5 race: stop vult tussen stopFill-check en cancel -> mag niet nog eens verkopen (short)', async () => {
    const book = newBook(m5!, '2024-01-01', 100); book.real = true; book.cash = 0;
    book.positions.QLD = { qty: 20, entryPrice: 50, entryDate: '2024-05-01', highWater: 60 };
    const mem = memStore(book);
    await mem.store.savePending(m5!.id, [{ symbol: 'QLD', side: 'sell', qty: 20, reason: 'regime' }]);
    const acc = fakeAccount({ price: 40, stopFillsAfterCheck: true }); acc.pos.QLD = 20;
    acc.setStops([{ symbol: 'QLD', qty: 20, stopPrice: 42, clientOrderId: `${momentumStopClientPrefix(m5!)}QLD-20-4200-0`, orderId: 'x0', status: 'new', filledQty: 0 }]);
    await executeDay({ date: '2024-06-01', cfgs: [m5!], hooks: m5Hooks, lastPrice: { QLD: 40 }, barsBySymbol: qldBars, broker: acc.b, store: mem.store });
    expect(acc.pos.QLD).toBeGreaterThanOrEqual(0);
  });

  it('L6 gedeeltelijk gevulde stop (8 van 20): exit verkoopt hooguit de rest', async () => {
    const book = newBook(m5!, '2024-01-01', 100); book.real = true; book.cash = 0;
    book.positions.QLD = { qty: 20, entryPrice: 50, entryDate: '2024-05-01', highWater: 60 };
    const mem = memStore(book);
    await mem.store.savePending(m5!.id, [{ symbol: 'QLD', side: 'sell', qty: 20, reason: 'regime' }]);
    const acc = fakeAccount({ price: 41 }); acc.pos.QLD = 12;
    acc.setStops([{ symbol: 'QLD', qty: 20, stopPrice: 42, clientOrderId: `${momentumStopClientPrefix(m5!)}QLD-20-4200-0`, orderId: 'x0', status: 'partially_filled', filledQty: 8 }]);
    await executeDay({ date: '2024-06-01', cfgs: [m5!], hooks: m5Hooks, lastPrice: { QLD: 41 }, barsBySymbol: qldBars, broker: acc.b, store: mem.store });
    expect(acc.pos.QLD).toBeGreaterThanOrEqual(0);
  });

  it('L7 herstart: execute (stop na fill) + reconcile in dezelfde run + tweede run geven precies 1 stop', async () => {
    const book = newBook(m5!, '2024-01-01', 100); book.real = true; book.cash = 5000;
    const mem = memStore(book);
    await mem.store.savePending(m5!.id, [{ symbol: 'QLD', side: 'buy', notionalUsd: 1000, reason: 'in' }]);
    const acc = fakeAccount({ price: 50 });
    for (const d of ['2024-06-01', '2024-06-02']) {
      await executeDay({ date: d, cfgs: [m5!], hooks: m5Hooks, lastPrice: { QLD: 50 }, barsBySymbol: qldBars, broker: acc.b, store: mem.store });
      await reconcileDisasterStops({ date: d, cfgs: [m5!], books: { [m5!.id]: mem.book() }, hooks: m5Hooks, barsBySymbol: qldBars, broker: acc.b });
    }
    expect(acc.stops().filter((s) => s.status === 'new').length).toBe(1);
    expect(acc.stops().find((s) => s.status === 'new')!.qty).toBe(20);
  });
});

describe('PR47 reconcile', () => {
  it('R1 twee open stops voor hetzelfde symbool: na dedupe blijft er precies 1 staan', async () => {
    const book = newBook(m5!, '2024-01-01', 100); book.real = true;
    book.positions.QLD = { qty: 20, entryPrice: 50, entryDate: '2024-05-01', highWater: 60 };
    const acc = fakeAccount({ price: 50 }); acc.pos.QLD = 20;
    const p = momentumStopClientPrefix(m5!);
    acc.setStops([
      { symbol: 'QLD', qty: 10, stopPrice: 40, clientOrderId: `${p}QLD-10-4000-0`, orderId: 'a', status: 'new', filledQty: 0 },
      { symbol: 'QLD', qty: 10, stopPrice: 38, clientOrderId: `${p}QLD-10-3800-0`, orderId: 'b', status: 'new', filledQty: 0 },
    ]);
    await reconcileDisasterStops({ date: '2024-06-01', cfgs: [m5!], books: { [m5!.id]: book }, hooks: m5Hooks, barsBySymbol: qldBars, broker: acc.b });
    expect(acc.stops().filter((s) => s.status === 'new').length).toBe(1);
  });

  it('R2 schaduwboek (real=false) wordt door reconcile overgeslagen', async () => {
    const book = newBook(m5!, '2024-01-01', 100);
    book.positions.QLD = { qty: 20, entryPrice: 50, entryDate: '2024-05-01', highWater: 60 };
    const acc = fakeAccount({ price: 50 });
    const r = await reconcileDisasterStops({ date: '2024-06-01', cfgs: [m5!], books: { [m5!.id]: book }, hooks: m5Hooks, barsBySymbol: qldBars, broker: acc.b });
    expect(r).toEqual({ recreated: [], cancelled: [], deduped: [] });
  });
});

describe('PR47 nieuw op a6fcc52', () => {
  it('N1 exit met openstaande eigen stop (normale situatie): positie wordt verkocht', async () => {
    const book = newBook(m5!, '2024-01-01', 100); book.real = true; book.cash = 0;
    book.positions.QLD = { qty: 20, entryPrice: 50, entryDate: '2024-05-01', highWater: 60 };
    const mem = memStore(book);
    await mem.store.savePending(m5!.id, [{ symbol: 'QLD', side: 'sell', qty: 20, reason: 'regime' }]);
    const acc = fakeAccount({ price: 55 }); acc.pos.QLD = 20;
    acc.setStops([{ symbol: 'QLD', qty: 20, stopPrice: 35, clientOrderId: `${momentumStopClientPrefix(m5!)}QLD-20-3500-0`, orderId: 'x0', status: 'new', filledQty: 0 }]);
    await executeDay({ date: '2024-06-01', cfgs: [m5!], hooks: m5Hooks, lastPrice: { QLD: 55 }, barsBySymbol: qldBars, broker: acc.b, store: mem.store });
    expect({ broker: acc.pos.QLD, boek: mem.book()!.positions.QLD?.qty ?? 0, log: acc.log }).toEqual({ broker: 0, boek: 0, log: ['cancel QLD', 'sell QLD 20'] });
  });

  it('N1b stop verhogen via executeDay bij open stop: nieuwe hogere stop staat er', async () => {
    const book = newBook(m5!, '2024-01-01', 100); book.real = true; book.cash = 0;
    book.positions.QLD = { qty: 20, entryPrice: 50, entryDate: '2024-01-02', highWater: 60 };
    const mem = memStore(book);
    const acc = fakeAccount({ price: 80 }); acc.pos.QLD = 20;
    acc.setStops([{ symbol: 'QLD', qty: 20, stopPrice: 1, clientOrderId: `${momentumStopClientPrefix(m5!)}QLD-20-100-0`, orderId: 'x0', status: 'new', filledQty: 0 }]);
    await executeDay({ date: '2024-06-01', cfgs: [m5!], hooks: m5Hooks, lastPrice: { QLD: 80 }, barsBySymbol: qldBars, broker: acc.b, store: mem.store });
    const live = acc.stops().filter((s) => s.status === 'new');
    expect(live.length).toBe(1);
    expect(live[0]!.stopPrice).toBeGreaterThan(1);
  });

  it('N3 M1 heeft al 0,04 BTC: M6 koopt 0,06 en zet stop + boek op 0,06, niet op 0,1', async () => {
    const book = newBook(m6, '2024-01-01', 100); book.real = true; book.cash = 10000;
    const mem = memStore(book);
    await mem.store.savePending(m6.id, [{ symbol: 'BTC/USD', side: 'buy', notionalUsd: 3000, reason: 'breakout', signalDate: '2024-05-31' }]);
    const acc = fakeAccount({ price: 50000 }); acc.pos['BTC/USD'] = 0.04; // M1 bezit
    await executeDay({ date: '2024-06-01', cfgs: [m6], hooks: m6Hooks, lastPrice: { 'BTC/USD': 50000 }, barsBySymbol: { 'BTC/USD': makeBars(60, 50000, 0.001, 0.02) }, broker: acc.b, store: mem.store });
    const st = acc.stops().filter((s) => s.status === 'new').map((s) => s.qty);
    expect({ stops: st, boek: mem.book()!.positions['BTC/USD']?.qty }).toEqual({ stops: [0.06], boek: 0.06 });
  });

  it('L8 blijvend gedeeltelijk gevulde stop (8 van 20) over twee runs: boek 12 en stop blijft staan', async () => {
    const book = newBook(m6, '2024-01-01', 100); book.real = true; book.cash = 0;
    book.positions['BTC/USD'] = { qty: 20, entryPrice: 50, entryDate: '2024-05-01', highWater: 60 };
    const mem = memStore(book);
    const acc = fakeAccount({ price: 41 }); acc.pos['BTC/USD'] = 12;
    acc.setStops([{ symbol: 'BTC/USD', qty: 20, stopPrice: 42, clientOrderId: `${momentumStopClientPrefix(m6)}BTC/USD-20-4200-0`, orderId: 'x0', status: 'partially_filled', filledQty: 8 }]);
    const bars = { 'BTC/USD': makeBars(60, 50, 0.001, 0.02) };
    for (const d of ['2024-06-01', '2024-06-02']) {
      await executeDay({ date: d, cfgs: [m6], hooks: m6Hooks, lastPrice: { 'BTC/USD': 41 }, barsBySymbol: bars, broker: acc.b, store: mem.store });
      await reconcileDisasterStops({ date: d, cfgs: [m6], books: { [m6.id]: mem.book() }, hooks: m6Hooks, barsBySymbol: bars, broker: acc.b }).catch(() => {});
    }
    expect({ boek: mem.book()!.positions['BTC/USD']?.qty ?? 0, openStops: acc.stops().filter((s) => ['new', 'partially_filled'].includes(s.status)).length }).toEqual({ boek: 12, openStops: 1 });
  });
});
