import { closesOf, dateOf } from './indicators';
import type { Bar } from './types';

/** Hoogste close sinds instap (inclusief `sinceDate`), optioneel exclusief vandaag. */
export function peakCloseSince(bars: Bar[], sinceDate: string, excludeFromDate?: string): number | null {
  const since = sinceDate.slice(0, 10);
  const exclude = excludeFromDate?.slice(0, 10);
  const slice = bars.filter((b) => {
    const d = dateOf(b);
    if (d < since) return false;
    if (exclude && d >= exclude) return false;
    return true;
  });
  if (!slice.length) return null;
  return Math.max(...closesOf(slice));
}

/** Zelfde afstand als close-disaster: pct onder peak close. */
export function closeDisasterStopPrice(peakClose: number, pct: number): number {
  return round2(peakClose * (1 - pct));
}

export function disasterStopFromBars(
  bars: Bar[],
  sinceDate: string,
  pct: number,
  excludeFromDate?: string,
  entryFallback?: number,
): number | null {
  const peak = peakCloseSince(bars, sinceDate, excludeFromDate);
  const base = peak ?? entryFallback;
  if (base == null || base <= 0) return null;
  return closeDisasterStopPrice(base, pct);
}

const round2 = (x: number) => Math.round(x * 100) / 100;
