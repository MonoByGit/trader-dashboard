import type { GuardConfig } from './config';

export const SOFT_START_DEFAULTS = {
  maxNewPositionsPerDay: 2,
  maxDailyCryptoTrades: 1,
  maxPositionSizePct: 5,
  maxTotalExposurePct: 15,
} as const;

/** Tighter portfolio caps while soft-start is on (paper ramp-up). */
export function applySoftStartToGuardConfig(
  config: GuardConfig,
  softStartEnabled: boolean,
): GuardConfig {
  if (!softStartEnabled) return config;
  return {
    ...config,
    maxPositions: Math.min(config.maxPositions, SOFT_START_DEFAULTS.maxNewPositionsPerDay),
    maxDailyTrades: Math.min(config.maxDailyTrades, SOFT_START_DEFAULTS.maxNewPositionsPerDay),
    maxDailyCryptoTrades: Math.min(
      config.maxDailyCryptoTrades,
      SOFT_START_DEFAULTS.maxDailyCryptoTrades,
    ),
    maxPositionSizePct: Math.min(config.maxPositionSizePct, SOFT_START_DEFAULTS.maxPositionSizePct),
    maxTotalExposurePct: Math.min(config.maxTotalExposurePct, SOFT_START_DEFAULTS.maxTotalExposurePct),
  };
}

export function parseSoftStartEnabled(raw: string | null | undefined, defaultOn = true): boolean {
  if (raw === undefined || raw === null || raw === '') return defaultOn;
  return raw === 'true' || raw === '1';
}
