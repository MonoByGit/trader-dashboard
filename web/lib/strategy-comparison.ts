import { createBacktestRun, getBacktestRun, type BacktestRunRow } from '@/lib/backtests';
import { queueBacktestJob } from '@/lib/backtest-runner';
import { dbQuery, dbRun, hasDb } from '@/lib/db';
import { ensureSchema } from '@/lib/migrate';
import {
  ensureActiveStrategyVersion,
  getStrategyVersionById,
} from '@/lib/strategy-versions';

export type ComparisonStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface StrategyComparisonRow {
  id: string;
  draft_id: string;
  active_id: string;
  period_start: string;
  period_end: string;
  draft_run_id: string | null;
  active_run_id: string | null;
  status: ComparisonStatus;
  summary: ComparisonSummary | null;
  created_at: string;
}

export interface ComparisonSummary {
  draft: { runId: string; metrics: BacktestRunRow['metrics'] } | null;
  active: { runId: string; metrics: BacktestRunRow['metrics'] } | null;
  spyTotalReturnPct: number | null;
  draftBeatsActive: boolean | null;
  draftBeatsSpy: boolean | null;
}

function newId(): string {
  return `cmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function startStrategyComparison(input: {
  draftId: string;
  periodStart: string;
  periodEnd: string;
  params?: BacktestRunRow['params'];
}): Promise<StrategyComparisonRow> {
  if (!hasDb()) throw new Error('Database not configured');
  await ensureSchema();

  const draft = await getStrategyVersionById(input.draftId);
  if (!draft) throw new Error('Draft strategy not found');
  if (draft.status !== 'draft') throw new Error('Comparison requires a draft strategy version');

  const active = await ensureActiveStrategyVersion();

  const draftRun = await createBacktestRun({
    strategyVersion: draft.version,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    params: {
      ...input.params,
      strategyVersionId: draft.id,
    } as BacktestRunRow['params'],
  });

  const activeRun = await createBacktestRun({
    strategyVersion: active.version,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    params: {
      ...input.params,
      strategyVersionId: active.id,
    } as BacktestRunRow['params'],
  });

  const id = newId();
  await dbRun(
    `INSERT INTO strategy_comparisons
      (id, draft_id, active_id, period_start, period_end, draft_run_id, active_run_id, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'queued',NOW())`,
    [id, draft.id, active.id, input.periodStart, input.periodEnd, draftRun.id, activeRun.id],
  );

  queueBacktestJob(draftRun.id);
  queueBacktestJob(activeRun.id);
  void watchComparison(id);

  const rows = await dbQuery<StrategyComparisonRow>(`SELECT * FROM strategy_comparisons WHERE id = $1`, [id]);
  return rows[0]!;
}

async function watchComparison(comparisonId: string): Promise<void> {
  const maxAttempts = 120;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const done = await refreshComparisonStatus(comparisonId);
    if (done) return;
  }
  await dbRun(`UPDATE strategy_comparisons SET status = 'failed' WHERE id = $1`, [comparisonId]);
}

export async function refreshComparisonStatus(comparisonId: string): Promise<boolean> {
  if (!hasDb()) return true;
  const rows = await dbQuery<StrategyComparisonRow>(
    `SELECT * FROM strategy_comparisons WHERE id = $1`,
    [comparisonId],
  );
  const cmp = rows[0];
  if (!cmp || !cmp.draft_run_id || !cmp.active_run_id) return true;

  const draftRun = await getBacktestRun(cmp.draft_run_id);
  const activeRun = await getBacktestRun(cmp.active_run_id);
  if (!draftRun || !activeRun) return false;

  const statuses = [draftRun.status, activeRun.status];
  if (statuses.some((s) => s === 'failed')) {
    await dbRun(`UPDATE strategy_comparisons SET status = 'failed' WHERE id = $1`, [comparisonId]);
    return true;
  }
  if (statuses.some((s) => s === 'queued' || s === 'running')) {
    await dbRun(`UPDATE strategy_comparisons SET status = 'running' WHERE id = $1`, [comparisonId]);
    return false;
  }

  const { buildComparisonSummary } = await import('../../src/strategy/comparison-summary');
  const summary: ComparisonSummary = buildComparisonSummary({
    draftRunId: draftRun.id,
    activeRunId: activeRun.id,
    draftMetrics: draftRun.metrics,
    activeMetrics: activeRun.metrics,
  });

  await dbRun(
    `UPDATE strategy_comparisons SET status = 'completed', summary = $2::jsonb WHERE id = $1`,
    [comparisonId, JSON.stringify(summary)],
  );
  return true;
}

export async function getStrategyComparison(id: string): Promise<StrategyComparisonRow | null> {
  if (!hasDb()) return null;
  await ensureSchema();
  await refreshComparisonStatus(id);
  const rows = await dbQuery<StrategyComparisonRow>(`SELECT * FROM strategy_comparisons WHERE id = $1`, [id]);
  return rows[0] ?? null;
}
