export interface CryptoGuardConfig {
  /** Max share of total account equity in crypto exposure (default 20%). */
  maxCryptoBudgetPct: number;
  /** Max single crypto position as % of total equity (default 5%). */
  maxCryptoPositionPct: number;
  /** Crypto-only daily loss limit (% of total equity at day start). */
  maxCryptoDailyLossPct: number;
  /** Soft-start: max new crypto positions opened per UTC day. */
  maxNewCryptoPositionsPerDay: number;
  /** Hard stop distance from entry (volatility-adjusted default 8%). */
  hardStopPct: number;
  /** Scheduler interval hours (1–4). */
  tickIntervalHours: number;
}

const num = (key: string, fallback: number) => {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export function loadCryptoGuardConfig(env: NodeJS.ProcessEnv = process.env): CryptoGuardConfig {
  const hours = Math.min(4, Math.max(1, num('CRYPTO_TICK_INTERVAL_HOURS', 2)));
  return {
    maxCryptoBudgetPct: num('CRYPTO_MAX_BUDGET_PCT', 20),
    maxCryptoPositionPct: num('CRYPTO_MAX_POSITION_PCT', 5),
    maxCryptoDailyLossPct: num('CRYPTO_MAX_DAILY_LOSS_PCT', 4),
    maxNewCryptoPositionsPerDay: num('CRYPTO_MAX_NEW_POSITIONS_PER_DAY', 2),
    hardStopPct: num('CRYPTO_HARD_STOP_PCT', 8) / 100,
    tickIntervalHours: hours,
  };
}
