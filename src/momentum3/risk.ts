import type { Position } from '../momentum2/types';
import type { M3Config } from './config';

/**
 * Harde stop bij entry. De trailing stop gaat pas aan zodra de winst `trailActivatePct` bereikt
 * (op basis van het hoogste punt) en beweegt daarna alleen omhoog mee.
 */
export function m3StopLevel(
  pos: Pick<Position, 'entryPrice' | 'highWater'>,
  cfg: Pick<M3Config, 'hardStopPct' | 'trailingStopPct' | 'trailActivatePct'>,
): { level: number; kind: 'hard' | 'trailing' } {
  const hard = pos.entryPrice * (1 - cfg.hardStopPct);
  if (pos.highWater >= pos.entryPrice * (1 + cfg.trailActivatePct)) {
    const trail = pos.highWater * (1 - cfg.trailingStopPct);
    if (trail > hard) return { level: trail, kind: 'trailing' };
  }
  return { level: hard, kind: 'hard' };
}
