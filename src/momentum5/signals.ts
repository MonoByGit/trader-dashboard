import { closesOf, sma } from '../momentum2/indicators';
import type { Bar } from '../momentum2/types';
import type { M5Config } from './config';

/** Band-state op QQQ: long boven SMA*(1+up), cash onder SMA*(1-down), anders `null` (houd aan). */
export function bandTarget(
  qqqBars: Bar[],
  cfg: Pick<M5Config, 'smaDays' | 'bandUpPct' | 'bandDownPct'>,
): 'risk' | 'cash' | 'hold' {
  const closes = closesOf(qqqBars);
  const ma = sma(closes, cfg.smaDays);
  if (ma == null) return 'hold';
  const last = closes[closes.length - 1]!;
  if (last > ma * (1 + cfg.bandUpPct)) return 'risk';
  if (last < ma * (1 - cfg.bandDownPct)) return 'cash';
  return 'hold';
}

/** Fresh up-signaal: close boven SMA*(1+up), voor herinstap na trailing stop. */
export function freshUpSignal(qqqBars: Bar[], cfg: Pick<M5Config, 'smaDays' | 'bandUpPct'>): boolean {
  const closes = closesOf(qqqBars);
  const ma = sma(closes, cfg.smaDays);
  if (ma == null) return false;
  return closes[closes.length - 1]! > ma * (1 + cfg.bandUpPct);
}
