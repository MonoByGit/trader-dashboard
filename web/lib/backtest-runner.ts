import strategy from '@/strategy.json';
import { fetchHistoricalDailyBars, fetchTradingDates } from '@/lib/backtest-bars';
import {
  createBacktestRun,
  getBacktestRun,
  saveBacktestResults,
  setBacktestStatus,
  type BacktestRunRow,
} from '@/lib/backtests';
import { runBacktest } from '@backtest/engine';
import type { BacktestParams, StrategyRulesLike } from '@backtest/types';
import { getStrategyVersion } from '@/lib/strategy-version';

export const DEFAULT_BACKTEST_PARAMS: BacktestParams = {
  initialCapital: 100_000,
  fillMode: 'next_open',
  slippageBps: 5,
  commissionPerShare: 0,
  minCommissionUsd: 0,
};

export interface StartBacktestInput {
  periodStart: string;
  periodEnd: string;
  strategyVersion?: string;
  params?: Partial<BacktestParams & { useLlmSampleDays?: number }>;
}

/** Execute backtest synchronously (CLI or worker). */
export async function executeBacktest(input: StartBacktestInput): Promise<{
  metrics: Awaited<ReturnType<typeof runBacktest>>['metrics'];
  trades: Awaited<ReturnType<typeof runBacktest>>['trades'];
  equityCurve: Awaited<ReturnType<typeof runBacktest>>['equityCurve'];
}> {
  const symbols = strategy.symbols as string[];
  const rules = strategy.rules as StrategyRulesLike;
  const params: BacktestParams = { ...DEFAULT_BACKTEST_PARAMS, ...input.params };
  const useLlm = input.params?.useLlmSampleDays ?? 0;
  if (useLlm > 0) {
    console.warn(
      `[backtest] LLM sampling (${useLlm} days) requested but not enabled in this build; running rule-based core only.`,
    );
  }

  const tradingDates = await fetchTradingDates(input.periodStart, input.periodEnd);
  if (tradingDates.length < 5) {
    throw new Error('Te weinig handelsdagen in de gekozen periode');
  }

  const allSymbols = [...symbols, 'SPY'];
  const barsBySymbol = await fetchHistoricalDailyBars(allSymbols, input.periodStart, input.periodEnd);
  const spyBars = barsBySymbol.SPY ?? [];
  delete barsBySymbol.SPY;

  const vixBars = await fetchHistoricalDailyBars(['VIXY'], input.periodStart, input.periodEnd).then(
    (m) => m.VIXY,
  ).catch(() => undefined);

  const result = runBacktest({
    tradingDates,
    barsBySymbol,
    spyBars,
    vixBars,
    symbols,
    rules,
    params,
  });

  return result;
}

export async function startBacktestRun(input: StartBacktestInput): Promise<BacktestRunRow> {
  const version = input.strategyVersion ?? getStrategyVersion();
  const params = { ...DEFAULT_BACKTEST_PARAMS, ...input.params };
  const run = await createBacktestRun({
    strategyVersion: version,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    params,
  });
  queueBacktestJob(run.id);
  return run;
}

const activeJobs = new Set<string>();

export function queueBacktestJob(runId: string): void {
  if (activeJobs.has(runId)) return;
  activeJobs.add(runId);
  void runBacktestJob(runId)
    .catch((e) => console.error('[backtest]', runId, e))
    .finally(() => activeJobs.delete(runId));
}

async function runBacktestJob(runId: string): Promise<void> {
  const run = await getBacktestRun(runId);
  if (!run || run.status === 'completed') return;

  await setBacktestStatus(runId, 'running', { started_at: new Date().toISOString() });

  try {
    const result = await executeBacktest({
      periodStart: run.period_start,
      periodEnd: run.period_end,
      strategyVersion: run.strategy_version,
      params: run.params,
    });

    await saveBacktestResults(
      runId,
      result.trades.map((t) => ({
        date: t.date,
        symbol: t.symbol,
        side: t.side,
        qty: t.qty,
        price: t.price,
        reason: t.reason,
        pnl: t.pnl,
      })),
      result.equityCurve.map((p) => ({
        date: p.date,
        equity: p.equity,
        cash: p.cash,
        exposure: p.exposure,
        spyEquity: p.spyEquity,
      })),
      result.metrics,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await setBacktestStatus(runId, 'failed', {
      error_message: msg,
      finished_at: new Date().toISOString(),
    });
  }
}
