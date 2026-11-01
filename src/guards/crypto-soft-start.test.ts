import { loadCryptoGuardConfig } from './crypto-config';
import { applySoftStartToCryptoGuardConfig } from './crypto-soft-start';

describe('applySoftStartToCryptoGuardConfig', () => {
  it('tightens crypto caps when soft-start is on', () => {
    const base = loadCryptoGuardConfig({});
    const tight = applySoftStartToCryptoGuardConfig(base, true);
    expect(tight.maxCryptoBudgetPct).toBeLessThanOrEqual(15);
    expect(tight.maxNewCryptoPositionsPerDay).toBeLessThanOrEqual(2);
  });

  it('leaves config unchanged when soft-start is off', () => {
    const base = loadCryptoGuardConfig({});
    expect(applySoftStartToCryptoGuardConfig(base, false)).toEqual(base);
  });
});
