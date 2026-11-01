import type { CopySignal } from './holdings';

/** Verplaats signalen van filedAt naar de eerstvolgende datum waar SPY een bar heeft (filedAt+1 uitvoering blijft in simulate). */
export function alignSignalsToTradingDays(
  signals: Record<string, CopySignal[]>,
  tradingDates: string[],
): Record<string, CopySignal[]> {
  if (!tradingDates.length) return signals;
  const sorted = [...tradingDates].sort();
  const out: Record<string, CopySignal[]> = {};
  for (const [filedAt, sigs] of Object.entries(signals)) {
    let d = filedAt;
    if (!sorted.includes(d)) {
      const next = sorted.find((t) => t >= filedAt);
      if (!next) continue;
      d = next;
    }
    out[d] = [...(out[d] ?? []), ...sigs];
  }
  return out;
}
