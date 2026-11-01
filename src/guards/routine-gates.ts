import type { RoutineGateInput, RoutineGateResult } from './types';

const ENTRY_ROUTINES = new Set(['market-open']);

/**
 * Emergency stop blocks every routine. Kill switch / circuit breaker block new entries only.
 */
export function canRunRoutine(input: RoutineGateInput): RoutineGateResult {
  if (input.emergencyStop) {
    return { allowed: false, reason: 'Emergency stop (noodstop) active' };
  }

  if (ENTRY_ROUTINES.has(input.routine)) {
    if (!input.tradingEnabled) {
      return { allowed: false, reason: 'Kill switch activated' };
    }
    if (input.circuitBreakerTripped) {
      return { allowed: false, reason: 'Circuit breaker tripped' };
    }
  }

  return { allowed: true };
}

export function blocksNewEntries(input: RoutineGateInput): boolean {
  if (input.emergencyStop) return true;
  if (!input.tradingEnabled) return true;
  if (input.circuitBreakerTripped) return true;
  return false;
}
