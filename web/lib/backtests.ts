import { dbQuery, dbRun, hasDb } from '@/lib/db';
import { ensureSchema } from '@/lib/migrate';
import type { BacktestMetrics, BacktestParams } from '@backtest/types';

export type BacktestRunStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface BacktestRunRow {
  id: string;
  strategy_version: string;
  params: BacktestParams & {
    useLlmSampleDays?: number;
    strategyVersionId?: string;
    barMode?: 'daily' | 'hourly';
  };
  period_start: string;
  period_end: string;
  status: BacktestRunStatus;
  metrics: BacktestMetrics | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface BacktestTradeRow {
  id: string;
  run_id: string;
  trade_date: string;
  symbol: string;
  side: string;
  qty: number;
  price: number;
  reason: string | null;
  pnl: number | null;
  seq: number;
}

export interface BacktestEquityRow {
  id: string;
  run_id: string;
  point_date: string;
  equity: number;
  cash: number;
  exposure: number;
  spy_equity: number;
  seq: number;
}

function newId(): string {
  return `bt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function createBacktestRun(input: {
  strategyVersion: string;
  periodStart: string;
  periodEnd: string;
  params: BacktestRunRow['params'];
}): Promise<BacktestRunRow> {
  if (!hasDb()) throw new Error('Database not configured');
  await ensureSchema();
  const id = newId();
  await dbRun(
    `INSERT INTO backtest_runs (id, strategy_version, params, period_start, period_end, status)
     VALUES ($1, $2, $3::jsonb, $4, $5, 'queued')`,
    [id, input.strategyVersion, JSON.stringify(input.params), input.periodStart, input.periodEnd],
  );
  const rows = await dbQuery<BacktestRunRow>(`SELECT * FROM backtest_runs WHERE id = $1`, [id]);
  return rows[0]!;
}

export async function listBacktestRuns(limit = 50): Promise<BacktestRunRow[]> {
  if (!hasDb()) return [];
  await ensureSchema();
  return dbQuery<BacktestRunRow>(
    `SELECT id, strategy_version, params, period_start::text AS period_start, period_end::text AS period_end,
      status, metrics, error_message, started_at, finished_at, created_at
     FROM backtest_runs ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
}

export async function getBacktestRun(id: string): Promise<BacktestRunRow | null> {
  if (!hasDb()) return null;
  await ensureSchema();
  const rows = await dbQuery<BacktestRunRow>(
    `SELECT id, strategy_version, params, period_start::text AS period_start, period_end::text AS period_end,
      status, metrics, error_message, started_at, finished_at, created_at
     FROM backtest_runs WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function setBacktestStatus(
  id: string,
  status: BacktestRunStatus,
  patch: { metrics?: BacktestMetrics; error_message?: string; started_at?: string; finished_at?: string } = {},
): Promise<void> {
  await dbRun(
    `UPDATE backtest_runs SET status = $2,
      metrics = COALESCE($3::jsonb, metrics),
      error_message = COALESCE($4, error_message),
      started_at = COALESCE($5::timestamptz, started_at),
      finished_at = COALESCE($6::timestamptz, finished_at)
     WHERE id = $1`,
    [
      id,
      status,
      patch.metrics ? JSON.stringify(patch.metrics) : null,
      patch.error_message ?? null,
      patch.started_at ?? null,
      patch.finished_at ?? null,
    ],
  );
}

export async function saveBacktestResults(
  runId: string,
  trades: { date: string; symbol: string; side: string; qty: number; price: number; reason: string; pnl?: number }[],
  equity: { date: string; equity: number; cash: number; exposure: number; spyEquity: number }[],
  metrics: BacktestMetrics,
): Promise<void> {
  await dbRun(`DELETE FROM backtest_trades WHERE run_id = $1`, [runId]);
  await dbRun(`DELETE FROM backtest_equity_points WHERE run_id = $1`, [runId]);

  let seq = 0;
  for (const t of trades) {
    await dbRun(
      `INSERT INTO backtest_trades (id, run_id, trade_date, symbol, side, qty, price, reason, pnl, seq)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        `${runId}_t${seq}`,
        runId,
        t.date,
        t.symbol,
        t.side,
        t.qty,
        t.price,
        t.reason,
        t.pnl ?? null,
        seq,
      ],
    );
    seq += 1;
  }

  seq = 0;
  for (const p of equity) {
    await dbRun(
      `INSERT INTO backtest_equity_points (id, run_id, point_date, equity, cash, exposure, spy_equity, seq)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        `${runId}_e${seq}`,
        runId,
        p.date,
        p.equity,
        p.cash,
        p.exposure,
        p.spyEquity,
        seq,
      ],
    );
    seq += 1;
  }

  await setBacktestStatus(runId, 'completed', {
    metrics,
    finished_at: new Date().toISOString(),
  });
}

export async function getBacktestTrades(runId: string): Promise<BacktestTradeRow[]> {
  if (!hasDb()) return [];
  await ensureSchema();
  return dbQuery<BacktestTradeRow>(
    `SELECT * FROM backtest_trades WHERE run_id = $1 ORDER BY seq ASC`,
    [runId],
  );
}

export async function getBacktestEquity(runId: string): Promise<BacktestEquityRow[]> {
  if (!hasDb()) return [];
  await ensureSchema();
  return dbQuery<BacktestEquityRow>(
    `SELECT * FROM backtest_equity_points WHERE run_id = $1 ORDER BY seq ASC`,
    [runId],
  );
}
