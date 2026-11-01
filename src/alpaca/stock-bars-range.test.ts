import { alpacaStockDailyEndExclusiveUtc } from './stock-bars-range';

describe('alpacaStockDailyEndExclusiveUtc', () => {
  it('returns the next calendar day so the current ET session bar is included', () => {
    expect(alpacaStockDailyEndExclusiveUtc('2026-11-01')).toBe('2026-11-02');
  });
});
