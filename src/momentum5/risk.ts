import { disasterStopFromBars } from '../momentum2/disaster-stop';
import type { Bar, Position } from '../momentum2/types';
import type { M5Config } from './config';

/**
 * Broker disaster-stop op risico-ETF (zelfde afstand als close-disaster in plan).
 * BIL (cash) heeft bewust geen stop.
 */
export function m5StopLevel(
  pos: Pick<Position, 'entryPrice' | 'highWater' | 'entryDate'>,
  cfg: M5Config,
  symbol: string,
  bars?: Bar[],
): { level: number; kind: 'hard' | 'trailing' } {
  if (symbol !== cfg.riskSymbol) return { level: -1, kind: 'hard' };
  if (!bars?.length) return { level: -1, kind: 'hard' };
  const level = disasterStopFromBars(bars, pos.entryDate, cfg.closeDisasterStopPct, undefined, pos.entryPrice);
  if (level == null || level <= 0) return { level: -1, kind: 'hard' };
  return { level, kind: 'hard' };
}

export const M5_AWAIT_FRESH_UP = 'm5AwaitFreshUp';
export const M5_DIPPED_FOR_FRESH = 'm5DippedForFresh';
