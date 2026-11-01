import {
  loadGuardConfig,
  loadCryptoGuardConfig,
  applySoftStartToGuardConfig,
  applySoftStartToCryptoGuardConfig,
  evaluateCircuitBreakers,
  evaluatePortfolioLimits,
  type GuardConfig,
  type CryptoGuardConfig,
} from '@guards/index';
import { isSoftStartEnabled } from '@/lib/strategy-versions';
import { dbQuery, dbRun, hasDb, initDb } from '@/lib/db';
import { nextConsecutiveLosses } from '../../../src/guards/consecutive-losses';

export interface GuardRuntimeState {
  tradingEnabled: boolean;
  circuitBreakerTripped: boolean;
  circuitBreakerReason?: string;
  circuitBreakerTrippedAt?: string;
  emergencyStop: boolean;
  emergencyStopAt?: string;
  dayStartEquity: number;
  sessionPeakEquity: number;
  tradingDay: string;
  consecutiveLosses: number;
}

export interface GuardStatusSnapshot extends GuardRuntimeState {
  config: GuardConfig;
  dailyDrawdownPct: number;
  peakDrawdownPct: number;
  openPositions: number;
  dailyTrades: number;
  ordersLast10Min: number;
  cashReservePct: number;
}

const SETTINGS = {
  tradingEnabled: 'trading_enabled',
  circuitTripped: 'circuit_breaker_tripped',
  circuitReason: 'circuit_breaker_reason',
  circuitAt: 'circuit_breaker_tripped_at',
  emergencyStop: 'emergency_stop',
  emergencyAt: 'emergency_stop_at',
  dayStartEquity: 'guard_day_start_equity',
  sessionPeakEquity: 'guard_session_peak_equity',
  tradingDay: 'guard_trading_day',
  consecutiveLosses: 'guard_consecutive_losses',
} as const;

let memState: GuardRuntimeState = {
  tradingEnabled: true,
  circuitBreakerTripped: false,
  emergencyStop: false,
  dayStartEquity: 0,
  sessionPeakEquity: 0,
  tradingDay: '',
  consecutiveLosses: 0,
};

async function getSetting(key: string): Promise<string | null> {
  if (!hasDb()) return null;
  await initDb();
  const rows = await dbQuery<{ value: string }>(`SELECT value FROM settings WHERE key=$1`, [key]);
  return rows.length ? rows[0].value : null;
}

async function setSetting(key: string, value: string): Promise<void> {
  if (!hasDb()) return;
  await initDb();
  await dbRun(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
    [key, value]
  );
}

function todayEt(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

export async function logGuardEvent(
  kind: string,
  reason: string,
  meta: Record<string, unknown> = {}
): Promise<void> {
  if (!hasDb()) return;
  await initDb();
  const id = `ge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await dbRun(
    `INSERT INTO guard_events (id, ts, kind, reason, meta) VALUES ($1, NOW(), $2, $3, $4)`,
    [id, kind, reason, JSON.stringify(meta)]
  );
}

export async function loadGuardState(): Promise<GuardRuntimeState> {
  if (!hasDb()) return { ...memState };

  const [
    tradingEnabled,
    circuitTripped,
    circuitReason,
    circuitAt,
    emergencyStop,
    emergencyAt,
    dayStart,
    sessionPeak,
    tradingDay,
    consec,
  ] = await Promise.all([
    getSetting(SETTINGS.tradingEnabled),
    getSetting(SETTINGS.circuitTripped),
    getSetting(SETTINGS.circuitReason),
    getSetting(SETTINGS.circuitAt),
    getSetting(SETTINGS.emergencyStop),
    getSetting(SETTINGS.emergencyAt),
    getSetting(SETTINGS.dayStartEquity),
    getSetting(SETTINGS.sessionPeakEquity),
    getSetting(SETTINGS.tradingDay),
    getSetting(SETTINGS.consecutiveLosses),
  ]);

  return {
    tradingEnabled: tradingEnabled === null ? true : tradingEnabled === 'true',
    circuitBreakerTripped: circuitTripped === 'true',
    circuitBreakerReason: circuitReason ?? undefined,
    circuitBreakerTrippedAt: circuitAt ?? undefined,
    emergencyStop: emergencyStop === 'true',
    emergencyStopAt: emergencyAt ?? undefined,
    dayStartEquity: dayStart ? parseFloat(dayStart) : 0,
    sessionPeakEquity: sessionPeak ? parseFloat(sessionPeak) : 0,
    tradingDay: tradingDay ?? '',
    consecutiveLosses: consec ? parseInt(consec, 10) : 0,
  };
}

async function persistGuardState(partial: Partial<GuardRuntimeState>): Promise<void> {
  if (!hasDb()) {
    memState = { ...memState, ...partial };
    return;
  }
  if (partial.tradingEnabled !== undefined) {
    await setSetting(SETTINGS.tradingEnabled, String(partial.tradingEnabled));
  }
  if (partial.circuitBreakerTripped !== undefined) {
    await setSetting(SETTINGS.circuitTripped, String(partial.circuitBreakerTripped));
  }
  if (partial.circuitBreakerReason !== undefined) {
    await setSetting(SETTINGS.circuitReason, partial.circuitBreakerReason);
  }
  if (partial.circuitBreakerTrippedAt !== undefined) {
    await setSetting(SETTINGS.circuitAt, partial.circuitBreakerTrippedAt);
  }
  if (partial.emergencyStop !== undefined) {
    await setSetting(SETTINGS.emergencyStop, String(partial.emergencyStop));
  }
  if (partial.emergencyStopAt !== undefined) {
    await setSetting(SETTINGS.emergencyAt, partial.emergencyStopAt);
  }
  if (partial.dayStartEquity !== undefined) {
    await setSetting(SETTINGS.dayStartEquity, String(partial.dayStartEquity));
  }
  if (partial.sessionPeakEquity !== undefined) {
    await setSetting(SETTINGS.sessionPeakEquity, String(partial.sessionPeakEquity));
  }
  if (partial.tradingDay !== undefined) {
    await setSetting(SETTINGS.tradingDay, partial.tradingDay);
  }
  if (partial.consecutiveLosses !== undefined) {
    await setSetting(SETTINGS.consecutiveLosses, String(partial.consecutiveLosses));
  }
}

export async function syncEquitySnapshots(equity: number): Promise<GuardRuntimeState> {
  const state = await loadGuardState();
  const day = todayEt();
  const updates: Partial<GuardRuntimeState> = {};

  if (state.tradingDay !== day || state.dayStartEquity <= 0) {
    updates.tradingDay = day;
    updates.dayStartEquity = equity;
    updates.sessionPeakEquity = equity;
    updates.consecutiveLosses = 0;
  } else {
    if (equity > state.sessionPeakEquity) {
      updates.sessionPeakEquity = equity;
    }
  }

  if (Object.keys(updates).length) {
    await persistGuardState({ ...state, ...updates });
    return { ...state, ...updates };
  }
  return state;
}

export async function countDailyTrades(): Promise<number> {
  if (!hasDb()) return 0;
  await initDb();
  const day = todayEt();
  const rows = await dbQuery<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM decisions
     WHERE decision='BUY'
       AND routine IN ('market-open', 'crypto-scan')
       AND (ts AT TIME ZONE 'America/New_York')::date = $1::date`,
    [day]
  );
  return rows.length ? parseInt(rows[0].c, 10) : 0;
}

export async function recordClosedTradePnl(realizedPnl: number): Promise<void> {
  const state = await loadGuardState();
  const next = nextConsecutiveLosses(state.consecutiveLosses, realizedPnl);
  if (next !== state.consecutiveLosses) {
    await persistGuardState({ consecutiveLosses: next });
  }
}

export async function countOrdersLast10Min(): Promise<number> {
  if (!hasDb()) return 0;
  await initDb();
  const rows = await dbQuery<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM decisions
     WHERE decision='BUY' AND ts >= NOW() - INTERVAL '10 minutes'`
  );
  return rows.length ? parseInt(rows[0].c, 10) : 0;
}

export async function refreshCircuitBreaker(equity: number): Promise<GuardRuntimeState> {
  const config = loadGuardConfig();
  let state = await syncEquitySnapshots(equity);
  const ordersLast10Min = await countOrdersLast10Min();

  const evalResult = evaluateCircuitBreakers(
    {
      equity,
      dayStartEquity: state.dayStartEquity,
      sessionPeakEquity: state.sessionPeakEquity,
      consecutiveLosses: state.consecutiveLosses,
      ordersLast10Min,
    },
    config
  );

  if (evalResult.tripped && !state.circuitBreakerTripped) {
    const at = new Date().toISOString();
    await persistGuardState({
      ...state,
      circuitBreakerTripped: true,
      circuitBreakerReason: evalResult.reason,
      circuitBreakerTrippedAt: at,
    });
    await logGuardEvent('circuit_breaker', evalResult.reason ?? 'Circuit breaker tripped', {
      trigger: evalResult.trigger,
      dailyDrawdownPct: evalResult.dailyDrawdownPct,
      peakDrawdownPct: evalResult.peakDrawdownPct,
    });
    state = await loadGuardState();
  }

  return state;
}

export async function tripCircuitBreaker(reason: string): Promise<void> {
  const at = new Date().toISOString();
  await persistGuardState({
    circuitBreakerTripped: true,
    circuitBreakerReason: reason,
    circuitBreakerTrippedAt: at,
  });
  await logGuardEvent('circuit_breaker', reason);
}

export async function resetCircuitBreaker(who: string): Promise<void> {
  await persistGuardState({
    circuitBreakerTripped: false,
    circuitBreakerReason: '',
    circuitBreakerTrippedAt: '',
  });
  await logGuardEvent('circuit_breaker_reset', `Manual reset by ${who}`);
}

export async function setEmergencyStop(active: boolean, who: string): Promise<void> {
  const at = new Date().toISOString();
  await persistGuardState({
    emergencyStop: active,
    emergencyStopAt: at,
  });
  if (active) {
    await setTradingEnabled(false);
    await logGuardEvent('emergency_stop', `Noodstop activated by ${who}`, { who });
  } else {
    await logGuardEvent('emergency_resume', `Trading routines re-enabled by ${who}`, { who });
  }
}

export async function setTradingEnabled(enabled: boolean): Promise<void> {
  await persistGuardState({ tradingEnabled: enabled });
  if (!hasDb()) memState.tradingEnabled = enabled;
  else await setSetting(SETTINGS.tradingEnabled, String(enabled));
}

export async function getEffectiveGuardConfig(): Promise<GuardConfig> {
  const base = loadGuardConfig();
  const soft = await isSoftStartEnabled();
  return applySoftStartToGuardConfig(base, soft);
}

export async function getEffectiveCryptoGuardConfig(): Promise<CryptoGuardConfig> {
  const base = loadCryptoGuardConfig();
  const soft = await isSoftStartEnabled();
  return applySoftStartToCryptoGuardConfig(base, soft);
}

export async function checkOrderAgainstLimits(input: {
  equity: number;
  cash: number;
  openPositionCount: number;
  dailyTrades: number;
  proposedOrderValueUsd: number;
  currentSymbolExposureUsd?: number;
  totalExposureUsd: number;
}) {
  const config = await getEffectiveGuardConfig();
  return evaluatePortfolioLimits(input, config);
}

export async function buildGuardStatus(
  equity: number,
  cash: number,
  openPositions: number
): Promise<GuardStatusSnapshot & { softStartEnabled: boolean }> {
  const softStartEnabled = await isSoftStartEnabled();
  const config = applySoftStartToGuardConfig(loadGuardConfig(), softStartEnabled);
  const state = await refreshCircuitBreaker(equity);
  const dailyTrades = await countDailyTrades();
  const ordersLast10Min = await countOrdersLast10Min();

  const dayStart = state.dayStartEquity > 0 ? state.dayStartEquity : equity;
  const peak = state.sessionPeakEquity > 0 ? state.sessionPeakEquity : equity;
  const dailyDrawdownPct = dayStart > 0 ? ((dayStart - equity) / dayStart) * 100 : 0;
  const peakDrawdownPct = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
  const cashReservePct = equity > 0 ? (cash / equity) * 100 : 100;

  return {
    ...state,
    config,
    softStartEnabled,
    dailyDrawdownPct: +dailyDrawdownPct.toFixed(2),
    peakDrawdownPct: +peakDrawdownPct.toFixed(2),
    openPositions,
    dailyTrades,
    ordersLast10Min,
    cashReservePct: +cashReservePct.toFixed(1),
  };
}
