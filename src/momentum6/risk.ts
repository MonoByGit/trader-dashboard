import { stopLevel } from '../momentum2/risk';
import type { Position } from '../momentum2/types';
import type { M6Config } from './config';

/** Harde stop bij entry; daarna 12% trailing vanaf high water. */
export function m6StopLevel(
  pos: Pick<Position, 'entryPrice' | 'highWater'>,
  cfg: M6Config,
): { level: number; kind: 'hard' | 'trailing' } {
  return stopLevel(pos, { hardStopPct: cfg.hardStopPct, trailingStopPct: cfg.trailingStopPct });
}
