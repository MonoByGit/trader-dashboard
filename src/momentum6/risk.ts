import type { Position } from '../momentum2/types';
import type { M6Config } from './config';

/** Geen intraday disaster: 20% close-trail in planM6 (volgende open), geen bad-tick triggers. */
export function m6StopLevel(
  _pos: Pick<Position, 'entryPrice' | 'highWater'>,
  _cfg: M6Config,
): { level: number; kind: 'hard' | 'trailing' } {
  return { level: -1, kind: 'hard' };
}
