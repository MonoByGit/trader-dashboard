import { buildComparisonSummary } from './comparison-summary';

describe('buildComparisonSummary', () => {
  const base = {
    totalReturnPct: 5,
    annualizedReturnPct: 5,
    maxDrawdownPct: 2,
    sharpeRatio: 1,
    winRatePct: 50,
    tradeCount: 10,
    avgExposurePct: 20,
    spyTotalReturnPct: 3,
    spyAnnualizedReturnPct: 3,
    spyMaxDrawdownPct: 4,
    spySharpeRatio: 0.5,
  };

  it('marks draft as winner when return beats active and SPY', () => {
    const s = buildComparisonSummary({
      draftRunId: 'd1',
      activeRunId: 'a1',
      draftMetrics: { ...base, totalReturnPct: 8 },
      activeMetrics: { ...base, totalReturnPct: 5 },
    });
    expect(s.draftBeatsActive).toBe(true);
    expect(s.draftBeatsSpy).toBe(true);
  });
});
