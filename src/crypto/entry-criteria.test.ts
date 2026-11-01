import { passesCryptoEntryCriteria } from './entry-criteria';

describe('passesCryptoEntryCriteria', () => {
  const rules = { rsi_min: 45, rsi_max: 70, volume_ratio_min: 1.0 };

  it('rejects when RSI is below rsi_min', () => {
    const r = passesCryptoEntryCriteria({ rsi: 40, volumeRatio: 1.2 }, rules);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/RSI/);
  });

  it('rejects when volume ratio is below minimum', () => {
    const r = passesCryptoEntryCriteria({ rsi: 55, volumeRatio: 0.8 }, rules);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Volume ratio/);
  });

  it('accepts when all criteria pass', () => {
    expect(passesCryptoEntryCriteria({ rsi: 55, volumeRatio: 1.1 }, rules)).toEqual({ ok: true });
  });

  it('rejects non-finite RSI or volume ratio', () => {
    expect(passesCryptoEntryCriteria({ rsi: NaN, volumeRatio: 1.1 }, rules).ok).toBe(false);
  });
});
