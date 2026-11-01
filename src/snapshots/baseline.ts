/** Baseline equity for snapshot series — skip leading zero-equity points. */

export interface EquityPoint {
  equity: number;
}

export function baselineFromSnapshotRow(row: {
  equity: number;
  baseline_equity: number;
  baseline_spy_close: number | null;
  sleeves?: { crypto?: { baselineBenchmarkClose?: number } } | null;
}): { equity: number; spyClose: number | null; btcClose: number | null } {
  const equity =
    row.baseline_equity > 0 ? row.baseline_equity : row.equity > 0 ? row.equity : 0;
  return {
    equity,
    spyClose: row.baseline_spy_close,
    btcClose: row.sleeves?.crypto?.baselineBenchmarkClose ?? null,
  };
}

export function firstNonZeroEquity<T extends EquityPoint>(rows: T[]): T | undefined {
  return rows.find((r) => Number.isFinite(r.equity) && r.equity > 0);
}

export function resolveSnapshotBaselineEquity(
  rows: EquityPoint[],
  configuredBaseline?: number | null,
): number {
  if (configuredBaseline != null && Number.isFinite(configuredBaseline) && configuredBaseline > 0) {
    return configuredBaseline;
  }
  const first = firstNonZeroEquity(rows);
  return first?.equity ?? rows[0]?.equity ?? 0;
}

export function snapshotsForChart<T extends EquityPoint>(rows: T[]): T[] {
  return rows.filter((r) => Number.isFinite(r.equity) && r.equity > 0);
}
