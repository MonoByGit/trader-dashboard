/** @jest-environment node */
import { jest } from '@jest/globals';

const saved: { book?: unknown } = {};

jest.unstable_mockModule('@/lib/db', () => ({
  hasDb: () => false,
  dbQuery: async () => [],
}));

const { loadOrInitRealBook } = await import('./paper-run');

describe('loadOrInitRealBook', () => {
  it('promoveert schaduwboek niet: start leeg papierboek', async () => {
    const store = {
      loadBook: async () => ({
        versionId: 'm5-nasdaq-trend',
        startDate: '2024-01-01',
        startBudgetUsd: 10_000,
        startSpyPrice: 100,
        cash: 0,
        positions: { QLD: { qty: 50, entryPrice: 40, entryDate: '2024-01-01', highWater: 40 } },
        peakEquity: 10_000,
        halted: false,
        haltReason: null,
        lastRebalanceIndex: 0,
      }),
      saveBook: async (b: unknown) => {
        saved.book = b;
      },
    };

    const cfg = {
      id: 'm5-nasdaq-trend',
      budgetUsd: 10_000,
      universe: ['QLD'],
      topN: 1,
      lookbackDays: 0,
      smaDays: 200,
      volDays: 10,
      rebalanceEveryDays: 1,
      hardStopPct: 0.3,
      trailingStopPct: 0.99,
      maxLossPct: 0.2,
      floatingBudget: true,
      maxGrossPct: 1,
      driftTolerance: 1,
      vetoEnabled: false,
    };

    const book = await loadOrInitRealBook(store as never, cfg as never, 100, '2024-06-01');
    expect(book.real).toBe(true);
    expect(Object.keys(book.positions)).toHaveLength(0);
    expect(book.cash).toBe(10_000);
  });
});
