/** Guard thresholds — env overrides documented in docs/risk-policy.md and .env.example */

export interface GuardConfig {
  maxDailyDrawdownPct: number;
  maxPeakDrawdownPct: number;
  maxPositions: number;
  maxPositionSizePct: number;
  maxTotalExposurePct: number;
  minCashReservePct: number;
  maxDailyTrades: number;
  maxOrderSizeUsd: number;
  minOrderSizeUsd: number;
  maxOrdersPer10Min: number;
  maxConsecutiveLosses: number;
  /** Minutes before official close when we refuse to cancel brackets / flatten */
  eodMinMinutesBeforeClose: number;
  /** Minutes after close when flatten is still allowed (market closed — keep brackets) */
  eodMaxMinutesAfterClose: number;
}

const num = (key: string, fallback: number) => {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export function loadGuardConfig(env: NodeJS.ProcessEnv = process.env): GuardConfig {
  return {
    maxDailyDrawdownPct: num('MAX_DAILY_DRAWDOWN_PCT', 3),
    maxPeakDrawdownPct: num('MAX_PEAK_DRAWDOWN_PCT', 5),
    maxPositions: num('MAX_POSITIONS', 3),
    maxPositionSizePct: num('MAX_POSITION_SIZE_PCT', 30),
    maxTotalExposurePct: num('MAX_TOTAL_EXPOSURE_PCT', 70),
    minCashReservePct: num('MIN_CASH_RESERVE_PCT', 10),
    maxDailyTrades: num('MAX_DAILY_TRADES', 10),
    maxOrderSizeUsd: num('MAX_ORDER_SIZE_USD', 30_000),
    minOrderSizeUsd: num('MIN_ORDER_SIZE_USD', 500),
    maxOrdersPer10Min: num('MAX_ORDERS_PER_10MIN', 5),
    maxConsecutiveLosses: num('MAX_CONSECUTIVE_LOSSES', 3),
    eodMinMinutesBeforeClose: num('EOD_MIN_MINUTES_BEFORE_CLOSE', 2),
    eodMaxMinutesAfterClose: num('EOD_MAX_MINUTES_AFTER_CLOSE', 5),
  };
}
