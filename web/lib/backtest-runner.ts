import strategy from '@/strategy.json';
import {
  fetchHistoricalDailyBars,
  fetchHistoricalHourlyBars,
  dailyBarsFromHourly,
  fetchTradingDates,
} from '@/lib/backtest-bars';
import {
  createBacktestRun,
  getBacktestRun,
  saveBacktestResults,
  setBacktestStatus,
  type BacktestRunRow,
} from '@/lib/backtests';
import { getStrategyVersionById } from '@/lib/strategy-versions';
import { runBacktest } from '@backtest/engine';
import type { BacktestParams, StrategyRulesLike } from '@backtest/types';
import type { StrategyContent as FullStrategyContent } from '../../src/strategy/content';
import { getStrategyVersion } from '@/lib/strategy-version';
import { executeCryptoBacktest } from '@/lib/backtest-crypto-runner';
import { getActiveCryptoStrategyVersionLabel } from '@/lib/crypto/strategy-version';

export const DEFAULT_BACKTEST_PARAMS: BacktestParams = {
  initialCapital: 100_000,
  fillMode: 'next_open',
  barMode: 'daily',
  slippageBps: 5,
  commissionPerShare: 0,
  minCommissionUsd: 0,
};

export interface StartBacktestInput {
  periodStart: string;
  periodEnd: string;
  strategyVersion?: string;
  strategyVersionId?: string;
  assetClass?: 'etf' | 'crypto';
  params?: Partial<
    BacktestParams & { useLlmSampleDays?: number; strategyVersionId?: string; assetClass?: string }
  >;
}

async function resolveStrategyForRun(input: StartBacktestInput): Promise<{
  versionLabel: string;
  content: FullStrategyContent;
}> {
  const versionId = input.strategyVersionId ?? input.params?.strategyVersionId;
  if (versionId) {
    const row = await getStrategyVersionById(versionId);
    if (row) {
      return { versionLabel: row.version, content: row.content };
    }
  }
  return {
    versionLabel: input.strategyVersion ?? getStrategyVersion(),
    content: strategy as FullStrategyContent,
  };
}

/** Execute backtest synchronously (CLI or worker). */
export async function executeBacktest(input: StartBacktestInput): Promise<{
  metrics: Awaited<ReturnType<typeof runBacktest>>['metrics'];
  trades: Awaited<ReturnType<typeof runBacktest>>['trades'];
  equityCurve: Awaited<ReturnType<typeof runBacktest>>['equityCurve'];
}> {
  const { content } = await resolveStrategyForRun(input);
  const symbols = content.symbols as string[];
  const rules = content.rules as StrategyRulesLike;
  const params: BacktestParams = {
    ...DEFAULT_BACKTEST_PARAMS,
    ...input.params,
    barMode: input.params?.barMode ?? DEFAULT_BACKTEST_PARAMS.barMode,
  };
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
  let hourlyBarsBySymbol: Record<string, import('@backtest/types').DailyBar[]> | undefined;
  let barsBySymbol: Record<string, import('@backtest/types').DailyBar[]>;

  if (params.barMode === 'hourly') {
    hourlyBarsBySymbol = await fetchHistoricalHourlyBars(allSymbols, input.periodStart, input.periodEnd);
    barsBySymbol = dailyBarsFromHourly(hourlyBarsBySymbol);
  } else {
    barsBySymbol = await fetchHistoricalDailyBars(allSymbols, input.periodStart, input.periodEnd);
  }

  const spyBars = barsBySymbol.SPY ?? [];
  delete barsBySymbol.SPY;
  if (hourlyBarsBySymbol) {
    delete hourlyBarsBySymbol.SPY;
  }

  const vixBars = await fetchHistoricalDailyBars(['VIXY'], input.periodStart, input.periodEnd)
    .then((m) => m.VIXY)
    .catch(() => undefined);

  const result = runBacktest({
    tradingDates,
    barsBySymbol,
    hourlyBarsBySymbol,
    spyBars,
    vixBars,
    symbols,
    rules,
    params,
  });

  return result;
}

export async function startBacktestRun(input: StartBacktestInput): Promise<BacktestRunRow> {
  const paramsAsset = input.params?.assetClass;
  const isCrypto = input.assetClass === 'crypto' || paramsAsset === 'crypto';

  let versionLabel: string;
  if (isCrypto) {
    versionLabel =
      input.strategyVersion ??
      (await getActiveCryptoStrategyVersionLabel().catch(() => getStrategyVersion()));
  } else {
    versionLabel = (await resolveStrategyForRun(input)).versionLabel;
  }

  const params = {
    ...DEFAULT_BACKTEST_PARAMS,
    ...input.params,
    barMode: input.params?.barMode ?? DEFAULT_BACKTEST_PARAMS.barMode,
    assetClass: isCrypto ? 'crypto' : 'etf',
  };

  const run = await createBacktestRun({
    strategyVersion: versionLabel,
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
    const runParams = run.params as BacktestParams & { assetClass?: string; strategyVersionId?: string };
    const isCrypto = runParams.assetClass === 'crypto';
    const result = isCrypto
      ? await executeCryptoBacktest({
          periodStart: run.period_start,
          periodEnd: run.period_end,
          params: runParams,
        })
      : await executeBacktest({
          periodStart: run.period_start,
          periodEnd: run.period_end,
          strategyVersion: run.strategy_version,
          strategyVersionId: runParams.strategyVersionId,
          params: runParams,
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
