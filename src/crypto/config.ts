/** Crypto module configuration (env defaults; runtime enable flag lives in DB). */

export interface CryptoGuardConfig {
  /** Max share of total account equity in crypto positions. */
  maxBudgetPct: number;
  /** Max notional per single crypto position vs total equity. */
  maxPositionPct: number;
  /** Crypto-only daily drawdown vs crypto day-start mark (stricter slice). */
  maxDailyDrawdownPct: number;
  /** Protective stop distance from entry (software or stop-limit). */
  hardStopPct: number;
  /** Optional take-profit distance from entry. */
  takeProfitPct: number;
  maxPositions: number;
  /** Hours between crypto scheduler ticks (24/7). */
  tickIntervalHours: number;
  /** Soft-start: cap new crypto entries per UTC day. */
  softStartEnabled: boolean;
  softStartMaxNewPositionsPerDay: number;
}

export interface CryptoStrategyRules {
  max_positions: number;
  position_size_pct: number;
  hard_stop_pct: number;
  take_profit_pct: number;
  rsi_min: number;
  rsi_max: number;
  volume_ratio_min: number;
}

const num = (key: string, fallback: number, env: NodeJS.ProcessEnv = process.env) => {
  const v = env[key];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const bool = (key: string, fallback: boolean, env: NodeJS.ProcessEnv = process.env) => {
  const v = env[key]?.toLowerCase();
  if (v === undefined || v === '') return fallback;
  return v === 'true' || v === '1' || v === 'yes';
};

export function defaultCryptoSymbols(): string[] {
  return ['BTC/USD', 'ETH/USD', 'SOL/USD', 'LTC/USD'];
}

export function loadCryptoSymbols(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.CRYPTO_SYMBOLS?.trim();
  if (!raw) return defaultCryptoSymbols();
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function loadCryptoGuardConfig(env: NodeJS.ProcessEnv = process.env): CryptoGuardConfig {
  return {
    maxBudgetPct: num('CRYPTO_MAX_BUDGET_PCT', 10, env),
    maxPositionPct: num('CRYPTO_MAX_POSITION_PCT', 3, env),
    maxDailyDrawdownPct: num('CRYPTO_MAX_DAILY_DRAWDOWN_PCT', 2, env),
    hardStopPct: num('CRYPTO_HARD_STOP_PCT', 8, env) / 100,
    takeProfitPct: num('CRYPTO_TAKE_PROFIT_PCT', 12, env) / 100,
    maxPositions: num('CRYPTO_MAX_POSITIONS', 3, env),
    tickIntervalHours: num('CRYPTO_TICK_INTERVAL_HOURS', 2, env),
    softStartEnabled: bool('CRYPTO_SOFT_START', true, env),
    softStartMaxNewPositionsPerDay: num('CRYPTO_SOFT_START_MAX_NEW_PER_DAY', 1, env),
  };
}

/** Dev-only override; production uses authenticated dashboard toggle in settings. */
export function envCryptoModuleForcedOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return bool('CRYPTO_MODULE_ENABLED', false, env);
}
