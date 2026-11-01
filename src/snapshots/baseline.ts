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
