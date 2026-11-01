import { isForeignStrategyOrder, m1CloseQty } from './strategy-tags';

describe('strategy tags', () => {
  it('herkent orders van andere strategieën, niet die van Momentum 1', () => {
    expect(isForeignStrategyOrder('m2s-m2-rotatie-a-SPY-123')).toBe(true);
    expect(isForeignStrategyOrder('m3-x-2026-11-02-BTC-b')).toBe(true);
    expect(isForeignStrategyOrder('etf-eod-SPY-sell-restop')).toBe(false);
    expect(isForeignStrategyOrder(undefined)).toBe(false);
  });
  it('M1 sluit nooit meer dan haar eigen deel', () => {
    expect(m1CloseQty(10, 0)).toBe(10);
    expect(m1CloseQty(10, 4)).toBe(6);
    expect(m1CloseQty(10, 10)).toBe(0);
    expect(m1CloseQty(10, 15)).toBe(0);
  });
});
