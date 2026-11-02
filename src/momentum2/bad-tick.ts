import type { Bar } from './types';

/**
 * Slechte ticks in backtest/sim: negeer een dag-low die meer dan `maxBelowPct` onder zowel open als close ligt
 * bij intraday stop-evaluatie. Live crypto gebruikt stop_limit (zie broker) zodat één print niet absurd vult.
 */
export const BAD_TICK_MAX_BELOW_PCT = 0.15;

export function barLowForStopCheck(bar: Pick<Bar, 'o' | 'l' | 'c'>, maxBelowPct = BAD_TICK_MAX_BELOW_PCT): number {
  const anchor = Math.min(bar.o, bar.c);
  const floor = anchor * (1 - maxBelowPct);
  return bar.l < floor ? anchor : bar.l;
}
