import { computePositionSize } from './sizing';

describe('backtest computePositionSize', () => {
  const closes = Array.from({ length: 25 }, (_, i) => 100 + i);

  it('returns zero shares for ETF when notional buys less than one share', () => {
    const r = computePositionSize({
      closes,
      price: 90_000,
      equity: 100_000,
      availableCash: 100_000,
      qtyMode: 'whole',
    });
    expect(r.shares).toBe(0);
  });

  it('returns fractional crypto qty for the same notional', () => {
    const r = computePositionSize({
      closes,
      price: 90_000,
      equity: 100_000,
      availableCash: 100_000,
      qtyMode: 'fractional',
    });
    expect(r.shares).toBeGreaterThan(0);
    expect(r.notional).toBeGreaterThan(0);
  });
});
