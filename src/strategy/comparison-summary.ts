import type { BacktestMetrics } from '../backtest/types';

export function buildComparisonSummary(input: {
  draftMetrics: BacktestMetrics | null;
  activeMetrics: BacktestMetrics | null;
  draftRunId: string;
  activeRunId: string;
}) {
  const spyPct = input.draftMetrics?.spyTotalReturnPct ?? input.activeMetrics?.spyTotalReturnPct ?? null;
  const draftRet = input.draftMetrics?.totalReturnPct ?? null;
  const activeRet = input.activeMetrics?.totalReturnPct ?? null;
  return {
    draft: { runId: input.draftRunId, metrics: input.draftMetrics },
    active: { runId: input.activeRunId, metrics: input.activeMetrics },
    spyTotalReturnPct: spyPct,
    draftBeatsActive: draftRet !== null && activeRet !== null ? draftRet > activeRet : null,
    draftBeatsSpy: draftRet !== null && spyPct !== null ? draftRet > spyPct : null,
  };
}
