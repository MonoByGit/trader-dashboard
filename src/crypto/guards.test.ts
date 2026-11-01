import { evaluateCryptoOrderLimits } from './guards';
import type { CryptoGuardConfig } from './config';

const baseConfig: CryptoGuardConfig = {
  maxBudgetPct: 10,
  maxPositionPct: 3,
  maxDailyDrawdownPct: 2,
  hardStopPct: 0.08,
  takeProfitPct: 0.12,
  maxPositions: 3,
  tickIntervalHours: 2,
  softStartEnabled: true,
  softStartMaxNewPositionsPerDay: 1,
};

describe('crypto guards', () => {
  it('rejects when global blocks entries', () => {
    const r = evaluateCryptoOrderLimits({
      equity: 100_000,
      cryptoExposureUsd: 0,
      proposedOrderValueUsd: 2_000,
      symbolExposureUsd: 0,
      openCryptoPositions: 0,
      newEntriesToday: 0,
      cryptoDayStartEquity: 5_000,
      cryptoBookValueUsd: 5_000,
      config: baseConfig,
      globalBlocksEntries: true,
    });
    expect(r.allowed).toBe(false);
    expect(r.failReasons.some((x) => x.includes('Global guard'))).toBe(true);
  });

  it('enforces budget and per-position caps', () => {
    const r = evaluateCryptoOrderLimits({
      equity: 100_000,
      cryptoExposureUsd: 9_000,
      proposedOrderValueUsd: 2_000,
      symbolExposureUsd: 0,
      openCryptoPositions: 1,
      newEntriesToday: 0,
      cryptoDayStartEquity: 10_000,
      cryptoBookValueUsd: 10_000,
      config: baseConfig,
      globalBlocksEntries: false,
    });
    expect(r.allowed).toBe(false);
    expect(r.failReasons.some((x) => x.includes('budget'))).toBe(true);
  });

  it('soft-start limits new entries per day', () => {
    const r = evaluateCryptoOrderLimits({
      equity: 100_000,
      cryptoExposureUsd: 1_000,
      proposedOrderValueUsd: 2_000,
      symbolExposureUsd: 0,
      openCryptoPositions: 1,
      newEntriesToday: 1,
      cryptoDayStartEquity: 3_000,
      cryptoBookValueUsd: 3_000,
      config: baseConfig,
      globalBlocksEntries: false,
    });
    expect(r.allowed).toBe(false);
    expect(r.failReasons.some((x) => x.includes('Soft-start'))).toBe(true);
  });
});
