import {
  baselineFromSnapshotRow,
  firstNonZeroEquity,
  resolveSnapshotBaselineEquity,
  snapshotsForChart,
} from './baseline';

describe('baselineFromSnapshotRow', () => {
  it('skips zero baseline_equity and uses first nonzero equity row', () => {
    const row = baselineFromSnapshotRow({
      equity: 50_000,
      baseline_equity: 0,
      baseline_spy_close: 400,
      sleeves: null,
    });
    expect(row.equity).toBe(50_000);
  });

  it('prefers stored baseline when positive', () => {
    const row = baselineFromSnapshotRow({
      equity: 55_000,
      baseline_equity: 48_000,
      baseline_spy_close: 390,
      sleeves: null,
    });
    expect(row.equity).toBe(48_000);
  });
});

describe('snapshot baseline helpers', () => {
  it('skips leading zero-equity points for baseline', () => {
    const rows = [
      { equity: 0 },
      { equity: 0 },
      { equity: 50_000 },
      { equity: 51_000 },
    ];
    expect(firstNonZeroEquity(rows)?.equity).toBe(50_000);
    expect(resolveSnapshotBaselineEquity(rows)).toBe(50_000);
  });

  it('prefers configured baseline when set', () => {
    expect(resolveSnapshotBaselineEquity([{ equity: 50_000 }], 100_000)).toBe(100_000);
  });

  it('excludes zero-equity rows from chart series', () => {
    const rows = [
      { equity: 0, trading_date: '2026-01-01' },
      { equity: 100_000, trading_date: '2026-01-02' },
    ];
    expect(snapshotsForChart(rows)).toHaveLength(1);
    expect(snapshotsForChart(rows)[0].equity).toBe(100_000);
  });
});
