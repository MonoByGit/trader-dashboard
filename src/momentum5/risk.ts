import type { Position } from '../momentum2/types';
import type { M5Config } from './config';

/**
 * Geen intraday stop op QLD/TQQQ: disaster is close-based in planM5 (volgende open).
 * BIL (cash) heeft bewust geen stop: het is de vlucht naar cash, geen risicopositie.
 */
export function m5StopLevel(
  _pos: Pick<Position, 'entryPrice' | 'highWater'>,
  cfg: M5Config,
  symbol: string,
): { level: number; kind: 'hard' | 'trailing' } {
  if (symbol !== cfg.riskSymbol) return { level: -1, kind: 'hard' };
  return { level: -1, kind: 'hard' };
}

export const M5_AWAIT_FRESH_UP = 'm5AwaitFreshUp';
export const M5_DIPPED_FOR_FRESH = 'm5DippedForFresh';
