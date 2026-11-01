import { baselineFromSnapshotRow } from '@/lib/snapshots';

describe('snapshot baseline', () => {
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
