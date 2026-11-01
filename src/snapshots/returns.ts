/** Daily and cumulative return math for Momentum vs SPY snapshots. */

export function dailyReturnPct(prev: number, curr: number): number | null {
  if (!Number.isFinite(prev) || !Number.isFinite(curr) || prev <= 0) return null;
  return ((curr - prev) / prev) * 100;
}

export function cumulativeReturnPct(baseline: number, current: number): number | null {
  if (!Number.isFinite(baseline) || !Number.isFinite(current) || baseline <= 0) return null;
  return ((current - baseline) / baseline) * 100;
}

export interface SnapshotRowInput {
  tradingDate: string;
  equity: number;
  spyClose: number | null;
}

export interface SnapshotComputed extends SnapshotRowInput {
  momentumDailyReturnPct: number | null;
  spyDailyReturnPct: number | null;
  momentumCumulativeReturnPct: number | null;
  spyCumulativeReturnPct: number | null;
  baselineEquity: number;
  baselineSpyClose: number | null;
}

/** Sort by tradingDate ascending before calling. */
export function computeSnapshotSeries(
  rows: SnapshotRowInput[],
  baselineEquity: number,
  baselineSpyClose: number | null,
): SnapshotComputed[] {
  const sorted = [...rows].sort((a, b) => a.tradingDate.localeCompare(b.tradingDate));
  let prevEquity: number | null = null;
  let prevSpy: number | null = null;

  return sorted.map((row) => {
    const momentumDailyReturnPct =
      prevEquity != null ? dailyReturnPct(prevEquity, row.equity) : null;
    const spyDailyReturnPct =
      row.spyClose != null && prevSpy != null
        ? dailyReturnPct(prevSpy, row.spyClose)
        : null;
    const momentumCumulativeReturnPct = cumulativeReturnPct(baselineEquity, row.equity);
    const spyCumulativeReturnPct =
      row.spyClose != null && baselineSpyClose != null
        ? cumulativeReturnPct(baselineSpyClose, row.spyClose)
        : null;

    if (prevEquity == null) prevEquity = row.equity;
    else prevEquity = row.equity;
    if (row.spyClose != null) prevSpy = row.spyClose;

    return {
      ...row,
      momentumDailyReturnPct,
      spyDailyReturnPct,
      momentumCumulativeReturnPct,
      spyCumulativeReturnPct,
      baselineEquity,
      baselineSpyClose,
    };
  });
}
