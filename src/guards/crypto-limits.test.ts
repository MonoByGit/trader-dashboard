import { evaluateCryptoLimits } from './crypto-limits';
import { loadCryptoGuardConfig } from './crypto-config';

describe('evaluateCryptoLimits', () => {
  const cfg = loadCryptoGuardConfig({});

  it('rejects when crypto budget exceeded', () => {
    const r = evaluateCryptoLimits(
      {
        totalEquityUsd: 100_000,
        cryptoExposureUsd: 18_000,
        symbolExposureUsd: 0,
        proposedOrderUsd: 5_000,
        newPositionsOpenedToday: 0,
        cryptoDayStartEquityUsd: 20_000,
        cryptoSleeveEquityUsd: 20_000,
      },
      cfg,
    );
    expect(r.allowed).toBe(false);
    expect(r.failReasons.some((x) => x.includes('budget'))).toBe(true);
  });

  it('trips daily loss from crypto change_today, not flat sleeve budget', () => {
    const r = evaluateCryptoLimits(
      {
        totalEquityUsd: 100_000,
        cryptoExposureUsd: 15_000,
        symbolExposureUsd: 15_000,
        proposedOrderUsd: 0,
        newPositionsOpenedToday: 0,
        cryptoDayStartEquityUsd: 20_000,
        cryptoSleeveEquityUsd: 20_000,
        cryptoDailyPnlUsd: -5_000,
      },
      cfg,
    );
    expect(r.allowed).toBe(false);
    expect(r.failReasons.some((x) => x.includes('daily loss'))).toBe(true);
  });

  it('enforces soft-start new positions per day', () => {
    const r = evaluateCryptoLimits(
      {
        totalEquityUsd: 100_000,
        cryptoExposureUsd: 5_000,
        symbolExposureUsd: 0,
        proposedOrderUsd: 2_000,
        newPositionsOpenedToday: 2,
        cryptoDayStartEquityUsd: 7_000,
        cryptoSleeveEquityUsd: 7_000,
      },
      cfg,
    );
    expect(r.allowed).toBe(false);
  });
});
