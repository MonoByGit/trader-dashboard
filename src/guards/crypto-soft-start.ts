import type { CryptoGuardConfig } from './crypto-config';
import { SOFT_START_DEFAULTS } from './soft-start';

/** ETF soft-start caps also tighten the crypto sleeve (both apply). */
export function applySoftStartToCryptoGuardConfig(
  config: CryptoGuardConfig,
  softStartEnabled: boolean,
): CryptoGuardConfig {
  if (!softStartEnabled) return config;
  return {
    ...config,
    maxNewCryptoPositionsPerDay: Math.min(
      config.maxNewCryptoPositionsPerDay,
      SOFT_START_DEFAULTS.maxNewPositionsPerDay,
    ),
    maxCryptoPositionPct: Math.min(
      config.maxCryptoPositionPct,
      SOFT_START_DEFAULTS.maxPositionSizePct,
    ),
    maxCryptoBudgetPct: Math.min(
      config.maxCryptoBudgetPct,
      SOFT_START_DEFAULTS.maxTotalExposurePct,
    ),
  };
}
