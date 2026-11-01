/** ET calendar date (YYYY-MM-DD) for an ISO bar timestamp. */
export function barTradingDateEt(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/** Drop today's in-progress daily bar so RSI/volume/chase use last completed session. */
export function dailyBarsExcludingTodayPartial<T extends { t?: string }>(
  bars: T[],
  todayEt: string,
): T[] {
  if (!bars.length) return bars;
  const dated = bars.filter((b) => b.t && barTradingDateEt(b.t) === todayEt);
  if (dated.length === 0) return bars;
  return bars.filter((b) => !b.t || barTradingDateEt(b.t) !== todayEt);
}

/** Close of the last daily bar strictly before today (ET). */
export function lastCompletedSessionClose(
  bars: { c: number; t?: string }[],
  todayEt: string,
): number | null {
  const completed = dailyBarsExcludingTodayPartial(bars, todayEt);
  if (!completed.length) return null;
  const last = completed[completed.length - 1]!;
  return last.c;
}
