import { MOMENTUM2_BASE } from './config';
import { makeBars } from './fixtures';
import { executeDay, type Store } from './live';
import { newBook } from './book';
import type { OrderIntent, VersionBook } from './types';

const cfg = { ...MOMENTUM2_BASE, id: 'v-exec', universe: ['AAA'], topN: 1, lookbackDays: 20, smaDays: 50, volDays: 10 };

describe('executeDay veiligheid', () => {
  it('slaat boek op vóór setStop na buy', async () => {
    const events: string[] = [];
    let book: VersionBook = newBook(cfg, '2024-01-01', 100);
    book.real = true;
    book.cash = 5000;

    const store: Store = {
      loadBook: async () => book,
      saveBook: async (b) => {
        events.push('saveBook');
        book = structuredClone(b);
      },
      loadPending: async () => [{ symbol: 'AAA', side: 'buy', notionalUsd: 1000, reason: 'test' }],
      savePending: async (_id, o) => {
        events.push(`pending:${o.length}`);
      },
      logEquity: async () => {},
      logTrade: async () => {
        events.push('trade');
      },
      logDecision: async () => {},
    };

    const broker = {
      marketOrder: async () => {
        events.push('market');
        return { orderId: 'b1', qty: 10, price: 100 };
      },
      setStop: async () => {
        events.push('setStop');
      },
      cancelStop: async () => {},
      stopFill: async () => null,
      listOpenStops: async () => [],
      positionQty: async () => 10,
    };

    const bars = makeBars(60, 100, 0.001, 0.01);
    const hooks = {
      stopFor: () => ({ level: 90, kind: 'hard' as const }),
      plan: async () => ({ orders: [] as OrderIntent[], vetoes: [] }),
    };

    await executeDay({
      date: '2024-06-02',
      cfgs: [cfg],
      hooks,
      lastPrice: { AAA: 100 },
      barsBySymbol: { AAA: bars },
      broker,
      store,
    });

    expect(events.indexOf('saveBook')).toBeLessThan(events.indexOf('setStop'));
  });

  it('zet stop terug als exit sell faalt na cancel', async () => {
    let book: VersionBook = newBook(cfg, '2024-01-01', 100);
    book.real = true;
    book.positions.AAA = { qty: 10, entryPrice: 100, entryDate: '2024-06-01', highWater: 100 };
    let setStopCalls = 0;

    const store: Store = {
      loadBook: async () => book,
      saveBook: async (b) => { book = structuredClone(b); },
      loadPending: async () => [{ symbol: 'AAA', side: 'sell', qty: 10, reason: 'exit' }],
      savePending: async () => {},
      logEquity: async () => {},
      logTrade: async () => {},
      logDecision: async () => {},
    };

    const broker = {
      marketOrder: async () => null,
      setStop: async () => { setStopCalls += 1; },
      cancelStop: async () => {},
      stopFill: async () => null,
      listOpenStops: async () => [],
      positionQty: async () => 10,
    };

    const bars = makeBars(60, 100, 0.001, 0.01);
    await executeDay({
      date: '2024-06-03',
      cfgs: [cfg],
      hooks: { stopFor: () => ({ level: 90, kind: 'hard' as const }), plan: async () => ({ orders: [], vetoes: [] }) },
      lastPrice: { AAA: 100 },
      barsBySymbol: { AAA: bars },
      broker,
      store,
    });

    expect(setStopCalls).toBeGreaterThanOrEqual(1);
    expect(book.positions.AAA?.qty).toBe(10);
  });
});
