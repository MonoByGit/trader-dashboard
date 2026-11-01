import { atrWilder } from '../momentum2/indicators';
import type { Bar } from '../momentum2/types';
import type { Position } from '../momentum2/types';
import type { M3Config } from './config';

/**
 * Harde stop bij entry. Trailing gaat pas aan na `trailActivatePct` winst op high water;
 * trailafstand = max(vaste %, ATR-multiple) zodat winnaars kunnen doorlopen zonder direct break-even exit.
 */
export function m3StopLevel(
  pos: Pick<Position, 'entryPrice' | 'highWater'>,
  cfg: Pick<M3Config, 'hardStopPct' | 'trailingStopPct' | 'trailActivatePct' | 'trailingAtrDays' | 'trailingAtrMult'>,
  bars?: Bar[],
): { level: number; kind: 'hard' | 'trailing' } {
  const hard = pos.entryPrice * (1 - cfg.hardStopPct);
  if (pos.highWater < pos.entryPrice * (1 + cfg.trailActivatePct)) {
    return { level: hard, kind: 'hard' };
  }
  let trailPct = cfg.trailingStopPct;
  if (bars && bars.length >= cfg.trailingAtrDays + 1) {
    const atr = atrWilder(bars, cfg.trailingAtrDays);
    if (atr != null && pos.highWater > 0) {
      trailPct = Math.max(trailPct, (cfg.trailingAtrMult * atr) / pos.highWater);
    }
  }
  const trail = pos.highWater * (1 - trailPct);
  if (trail > hard) return { level: trail, kind: 'trailing' };
  return { level: hard, kind: 'hard' };
}
