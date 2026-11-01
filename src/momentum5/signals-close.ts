import { closesOf, dateOf } from '../momentum2/indicators';
import type { Bar } from '../momentum2/types';

/** Close onder peak-close sinds instap (exclusief vandaag) met drempel pct. */
export function exitCloseDisasterFromPeak(
  bars: Bar[],
  pct: number,
  sinceDate: string,
): boolean {
  const entryIdx = bars.findIndex((b) => dateOf(b) >= sinceDate.slice(0, 10));
  if (entryIdx < 0 || bars.length < entryIdx + 2) return false;
  const closes = closesOf(bars);
  const hist = closes.slice(entryIdx, -1);
  if (hist.length === 0) return false;
  const peak = Math.max(...hist);
  const today = closes[closes.length - 1]!;
  return today < peak * (1 - pct);
}
