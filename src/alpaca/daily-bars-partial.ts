/** ET calendar date (YYYY-MM-DD) for an ISO bar timestamp. */
export function barTradingDateEt(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/** UTC calendar date (YYYY-MM-DD) for an ISO bar timestamp (Alpaca crypto daily bars). */
export function barTradingDateUtc(isoTimestamp: string): string {
  return new Date(isoTimestamp).toISOString().slice(0, 10);
}

export type DailyBarSessionCalendar = 'et' | 'utc';

function barSessionDate(isoTimestamp: string, calendar: DailyBarSessionCalendar): string {
  return calendar === 'utc' ? barTradingDateUtc(isoTimestamp) : barTradingDateEt(isoTimestamp);
}

/** Drop today's in-progress daily bar so RSI/volume/chase use last completed session. */
export function dailyBarsExcludingTodayPartial<T extends { t?: string }>(
  bars: T[],
  todayYmd: string,
  opts?: { calendar?: DailyBarSessionCalendar },
): T[] {
  if (!bars.length) return bars;
  const calendar = opts?.calendar ?? 'et';
  const dated = bars.filter((b) => b.t && barSessionDate(b.t, calendar) === todayYmd);
  if (dated.length === 0) return bars;
  return bars.filter((b) => !b.t || barSessionDate(b.t, calendar) !== todayYmd);
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
