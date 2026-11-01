import { qtyFromNotional } from './order-qty';

describe('qtyFromNotional', () => {
  it('uses whole shares for ETF mode', () => {
    expect(qtyFromNotional(5000, 400, 'whole')).toBe(12);
    expect(qtyFromNotional(399, 400, 'whole')).toBe(0);
  });

  it('allows fractional crypto qty rounded down to 8 decimals', () => {
    const qty = qtyFromNotional(5000, 90_000, 'fractional');
    expect(qty).toBeGreaterThan(0);
    expect(qty).toBeCloseTo(5000 / 90_000, 7);
    expect(qty * 90_000).toBeLessThanOrEqual(5000);
  });

  it('rejects crypto qty below min notional', () => {
    expect(qtyFromNotional(0.5, 90_000, 'fractional')).toBe(0);
  });
});
