/**
 * Volatility proxy for live/backtest gates when VIX spot is unavailable.
 * VIXY (short-term VIX futures ETF) vs its own 20-day average:
 * ratio > max ⇒ elevated fear / stress (fail vix_below_limit).
 */
export function vixyStressRatio(closes: number[], smaPeriod = 20): number | null {
  if (closes.length < smaPeriod) return null;
  const window = closes.slice(-smaPeriod);
  const sma = window.reduce((a, v) => a + v, 0) / smaPeriod;
  const last = window[window.length - 1]!;
  if (sma <= 0) return null;
  return last / sma;
}

export function volStressPasses(ratio: number | null, maxRatio: number): boolean | null {
  if (ratio == null || !Number.isFinite(ratio)) return null;
  return ratio <= maxRatio;
}

/** Default: VIXY ≤ 15% above its 20d average. Override via strategy.rules.vol_stress_ratio_max. */
export const DEFAULT_VOL_STRESS_RATIO_MAX = 1.15;
