import type { GuardConfig } from './config';
import type { CircuitBreakerInput, CircuitBreakerResult } from './types';

export function evaluateCircuitBreakers(
  input: CircuitBreakerInput,
  config: GuardConfig
): CircuitBreakerResult {
  const dayStart = input.dayStartEquity > 0 ? input.dayStartEquity : input.equity;
  const peak = input.sessionPeakEquity > 0 ? input.sessionPeakEquity : input.equity;

  const dailyDrawdownPct =
    dayStart > 0 ? ((dayStart - input.equity) / dayStart) * 100 : 0;
  const peakDrawdownPct =
    peak > 0 ? ((peak - input.equity) / peak) * 100 : 0;

  const base = {
    tripped: false as boolean,
    dailyDrawdownPct: +dailyDrawdownPct.toFixed(4),
    peakDrawdownPct: +peakDrawdownPct.toFixed(4),
  };

  if (dailyDrawdownPct > config.maxDailyDrawdownPct) {
    return {
      ...base,
      tripped: true,
      trigger: 'daily_drawdown',
      reason: `Daily drawdown ${dailyDrawdownPct.toFixed(2)}% exceeds limit ${config.maxDailyDrawdownPct}%`,
    };
  }

  if (peakDrawdownPct > config.maxPeakDrawdownPct) {
    return {
      ...base,
      tripped: true,
      trigger: 'peak_drawdown',
      reason: `Peak drawdown ${peakDrawdownPct.toFixed(2)}% exceeds limit ${config.maxPeakDrawdownPct}%`,
    };
  }

  if (input.consecutiveLosses >= config.maxConsecutiveLosses) {
    return {
      ...base,
      tripped: true,
      trigger: 'consecutive_losses',
      reason: `${input.consecutiveLosses} consecutive losing trades (limit ${config.maxConsecutiveLosses})`,
    };
  }

  if (input.ordersLast10Min > config.maxOrdersPer10Min) {
    return {
      ...base,
      tripped: true,
      trigger: 'rapid_orders',
      reason: `${input.ordersLast10Min} orders in 10 minutes (limit ${config.maxOrdersPer10Min})`,
    };
  }

  return base;
}
