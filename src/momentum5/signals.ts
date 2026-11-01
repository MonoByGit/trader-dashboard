import { closesOf, sma } from '../momentum2/indicators';
import type { Bar, VersionBook } from '../momentum2/types';
import type { M5Config } from './config';
import { M5_AWAIT_FRESH_UP, M5_DIPPED_FOR_FRESH } from './risk';

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

function upperBand(closes: number[], cfg: Pick<M5Config, 'smaDays' | 'bandUpPct'>): number | null {
  const ma = sma(closes, cfg.smaDays);
  return ma == null ? null : ma * (1 + cfg.bandUpPct);
}

/** Na trailing stop: QQQ eerst op of onder de bovenband, daarna opnieuw erboven (nieuwe crossing). */
export function updateFreshUpArm(qqqBars: Bar[], cfg: Pick<M5Config, 'smaDays' | 'bandUpPct'>, book: VersionBook): void {
  const closes = closesOf(qqqBars);
  const upper = upperBand(closes, cfg);
  if (upper == null) return;
  const last = closes[closes.length - 1]!;
  if (last <= upper) {
    book.strategyState = { ...book.strategyState, [M5_DIPPED_FOR_FRESH]: true };
  }
}

export function freshUpSignal(
  qqqBars: Bar[],
  cfg: Pick<M5Config, 'smaDays' | 'bandUpPct'>,
  book: VersionBook,
): boolean {
  updateFreshUpArm(qqqBars, cfg, book);
  const closes = closesOf(qqqBars);
  const upper = upperBand(closes, cfg);
  if (upper == null) return false;
  const last = closes[closes.length - 1]!;
  return book.strategyState?.[M5_DIPPED_FOR_FRESH] === true && last > upper;
}

export function armFreshUpAfterStop(book: VersionBook): void {
  book.strategyState = {
    ...book.strategyState,
    [M5_AWAIT_FRESH_UP]: true,
    [M5_DIPPED_FOR_FRESH]: false,
  };
}
