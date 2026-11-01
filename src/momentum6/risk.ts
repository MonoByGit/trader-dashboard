import type { Position } from '../momentum2/types';
import type { M6Config } from './config';

/** Alleen brede intraday-noodstop (20%); close-exits zitten in planM6. */
export function m6StopLevel(
  pos: Pick<Position, 'entryPrice' | 'highWater'>,
  cfg: M6Config,
): { level: number; kind: 'hard' | 'trailing' } {
  return { level: pos.entryPrice * (1 - cfg.hardStopPct), kind: 'hard' };
}
