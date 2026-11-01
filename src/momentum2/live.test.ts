import { MOMENTUM2_BASE } from './config';
import { makeBars } from './fixtures';
import { decideDay, executeDay, type Broker, type DecisionRecord, type Store } from './live';
import type { EquityLogRow, OrderIntent, TradeLogRow, VersionBook } from './types';

function fakeStore() {
  const books: Record<string, VersionBook> = {};
  const pending: Record<string, OrderIntent[]> = {};
  const eq: EquityLogRow[] = []; const tr: TradeLogRow[] = []; const dec: DecisionRecord[] = [];
  const store: Store = {
    loadBook: async (id) => books[id] ?? null,
    saveBook: async (b) => { books[b.versionId] = JSON.parse(JSON.stringify(b)); },
    loadPending: async (id) => pending[id] ?? [],
    savePending: async (id, o) => { pending[id] = o; },
    logEquity: async (_id, r) => { eq.push(r); },
    logTrade: async (_id, r) => { tr.push(r); },
    logDecision: async (r) => { dec.push(r); },
  };
  return { store, books, pending, eq, tr, dec };
}

function fakeBroker() {
  const stops: Record<string, number> = {};
  const orders: string[] = [];
  const stopFills: Record<string, { orderId: string; qty: number; price: number }> = {};
  const broker: Broker = {
    marketOrder: async (o) => { orders.push(`${o.side}:${o.symbol}:${o.qty}`); return { orderId: o.clientOrderId, qty: o.qty, price: 100 }; },
    setStop: async (o) => { stops[`${o.versionId}:${o.symbol}`] = o.stopPrice; },
    cancelStop: async (o) => { delete stops[`${o.versionId}:${o.symbol}`]; },
    stopFill: async (o) => stopFills[`${o.versionId}:${o.symbol}`] ?? null,
  };
  return { broker, stops, orders, stopFills };
}

const cfg = { ...MOMENTUM2_BASE, universe: ['AAA'], topN: 1, lookbackDays: 20, smaDays: 50, volDays: 10 };
const bars = makeBars(120, 100, 0.004, 0.01);
const spy = makeBars(120, 100, 0.001, 0.01);
const date = bars[119]!.t.slice(0, 10);

describe('live', () => {
  it('beslist na de close, voert uit bij de open, zet harde stop bij entry', async () => {
    const s = fakeStore(); const b = fakeBroker();
    const { planned } = await decideDay({ date, cfgs: [cfg], barsBySymbol: { AAA: bars, SPY: spy }, benchmark: spy, store: s.store });
    expect(planned[cfg.id]).toEqual([expect.objectContaining({ symbol: 'AAA', side: 'buy' })]);
    expect(s.eq).toHaveLength(1);
    const r = await executeDay({ date: '2099-01-02', cfgs: [cfg], lastPrice: { AAA: 100 }, broker: b.broker, store: s.store });
    expect(r.trades).toHaveLength(1);
    expect(b.stops[`${cfg.id}:AAA`]).toBe(92); // 8% onder entry
    expect(s.pending[cfg.id]).toEqual([]);
  });

  it('afgegane stop wordt verwerkt en de trailing stop gaat alleen omhoog mee', async () => {
    const s = fakeStore(); const b = fakeBroker();
    await decideDay({ date, cfgs: [cfg], barsBySymbol: { AAA: bars, SPY: spy }, benchmark: spy, store: s.store });
    await executeDay({ date: '2099-01-02', cfgs: [cfg], lastPrice: { AAA: 100 }, broker: b.broker, store: s.store });
    s.books[cfg.id]!.positions.AAA!.highWater = 130;
    await executeDay({ date: '2099-01-03', cfgs: [cfg], lastPrice: { AAA: 125 }, broker: b.broker, store: s.store });
    expect(b.stops[`${cfg.id}:AAA`]).toBeCloseTo(117, 6);
    b.stopFills[`${cfg.id}:AAA`] = { orderId: 's', qty: s.books[cfg.id]!.positions.AAA!.qty, price: 117 };
    const r = await executeDay({ date: '2099-01-04', cfgs: [cfg], lastPrice: { AAA: 116 }, broker: b.broker, store: s.store });
    expect(r.trades[0]).toMatchObject({ side: 'sell', reason: 'stop (broker)' });
    expect(Object.keys(s.books[cfg.id]!.positions)).toHaveLength(0);
  });

  it('wacht met beslissen zolang er te weinig historie is', async () => {
    const s = fakeStore();
    const short = spy.slice(0, 30);
    await decideDay({ date: short[29]!.t.slice(0, 10), cfgs: [cfg], barsBySymbol: { AAA: bars.slice(0, 30) }, benchmark: short, store: s.store });
    expect(s.dec[0]).toMatchObject({ kind: 'skip' });
    expect(s.eq).toHaveLength(0);
  });

  it('veto wordt gelogd met model en versie', async () => {
    const s = fakeStore();
    const veto = async () => ({ veto: true, reason: 'event', model: 'deepseek-chat', modelVersion: 'v3.1' });
    const { planned } = await decideDay({ date, cfgs: [cfg], barsBySymbol: { AAA: bars, SPY: spy }, benchmark: spy, store: s.store, veto });
    expect(planned[cfg.id]).toEqual([]);
    expect(s.dec.find((d) => d.kind === 'veto')?.veto).toMatchObject({ model: 'deepseek-chat', modelVersion: 'v3.1', veto: true });
  });
});
