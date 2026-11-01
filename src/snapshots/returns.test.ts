import { computeSnapshotSeries, cumulativeReturnPct, dailyReturnPct } from './returns.js';

describe('snapshot return math', () => {
  it('computes daily return', () => {
    expect(dailyReturnPct(100, 101)).toBeCloseTo(1);
    expect(dailyReturnPct(100, 99)).toBeCloseTo(-1);
    expect(dailyReturnPct(0, 100)).toBeNull();
  });

  it('computes cumulative return', () => {
    expect(cumulativeReturnPct(100_000, 105_000)).toBeCloseTo(5);
  });

  it('builds series with cumulative from baseline', () => {
    const out = computeSnapshotSeries(
      [
        { tradingDate: '2026-01-02', equity: 100_000, spyClose: 400 },
        { tradingDate: '2026-01-03', equity: 101_000, spyClose: 404 },
      ],
      100_000,
      400,
    );
    expect(out).toHaveLength(2);
    expect(out[0].momentumDailyReturnPct).toBeNull();
    expect(out[1].momentumDailyReturnPct).toBeCloseTo(1);
    expect(out[1].momentumCumulativeReturnPct).toBeCloseTo(1);
    expect(out[1].spyDailyReturnPct).toBeCloseTo(1);
    expect(out[1].spyCumulativeReturnPct).toBeCloseTo(1);
  });
});
