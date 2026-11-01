import { jest } from '@jest/globals';
import { tradingDateEt } from '@scheduler/decide';

const portfolioTs = Date.parse('2024-01-02T20:00:00Z');
const portfolioDay = tradingDateEt(portfolioTs);

const dbRun = jest.fn(async () => undefined);
const dbQuery = jest.fn(async () => []);

jest.unstable_mockModule('@/lib/db', () => ({
  hasDb: () => true,
  dbQuery,
  dbRun,
}));

jest.unstable_mockModule('@/lib/migrate', () => ({
  ensureSchema: async () => undefined,
}));

jest.unstable_mockModule('@/lib/alpaca', () => ({
  alpaca: {
    portfolioHistory: async () => ({
      timestamp: [Math.floor(portfolioTs / 1000)],
      equity: [50_000],
    }),
  },
}));

jest.unstable_mockModule('@/lib/alpaca-bars', () => ({
  fetchStockDailyBars: async () => ({
    SPY: [{ t: `${portfolioDay}T00:00:00Z`, o: 400, h: 401, l: 399, c: 400, v: 1 }],
  }),
  fetchCryptoBars: async () => ({
    'BTC/USD': [{ t: `${portfolioDay}T00:00:00Z`, o: 42_000, h: 42_100, l: 41_900, c: 42_000, v: 1 }],
  }),
}));

const { backfillSnapshotsFromAlpaca } = await import('@/lib/snapshots');

describe('backfillSnapshotsFromAlpaca', () => {
  it('writes btc_close alongside spy_close', async () => {
    dbRun.mockClear();
    await backfillSnapshotsFromAlpaca({ start: portfolioDay, end: portfolioDay });
    expect(dbRun).toHaveBeenCalled();
    const params = dbRun.mock.calls[0]![1] as unknown[];
    expect(params[3]).toBe(42_000);
  });
});
