import { disasterStopFromBars } from '../momentum2/disaster-stop';
import type { Bar, Position } from '../momentum2/types';
import type { M6Config } from './config';

/** Broker disaster-stop (20% onder peak close sinds signaal); overige exits blijven in plan. */
export function m6StopLevel(
  pos: Pick<Position, 'entryPrice' | 'highWater' | 'entryDate' | 'signalDate'>,
  cfg: M6Config,
  _symbol?: string,
  bars?: Bar[],
): { level: number; kind: 'hard' | 'trailing' } {
  if (!bars?.length) return { level: -1, kind: 'hard' };
  const since = pos.signalDate ?? pos.entryDate;
  const level = disasterStopFromBars(bars, since, cfg.hardStopPct, undefined, pos.entryPrice);
  if (level == null || level <= 0) return { level: -1, kind: 'hard' };
  return { level, kind: 'hard' };
}
