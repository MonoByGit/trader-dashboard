import { stopLevel } from '../momentum2/risk';
import type { Position } from '../momentum2/types';
import type { M5Config } from './config';

/** Alleen trailing 15% op het risico-ETF; BIL heeft geen stop. */
export function m5StopLevel(
  pos: Pick<Position, 'entryPrice' | 'highWater'>,
  cfg: M5Config,
  symbol: string,
): { level: number; kind: 'hard' | 'trailing' } {
  if (symbol !== cfg.riskSymbol) return { level: -1, kind: 'hard' };
  return stopLevel(pos, { hardStopPct: cfg.hardStopPct, trailingStopPct: cfg.trailingStopPct });
}

export const M5_AWAIT_FRESH_UP = 'm5AwaitFreshUp';
