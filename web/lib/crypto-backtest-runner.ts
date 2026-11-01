import cryptoStrategy from '@/crypto-strategy.json';
import { calendarDaysBetween, fetchCryptoDailyBars } from '@/lib/backtest-crypto-bars';
import {
  createBacktestRun,
  saveBacktestResults,
  setBacktestStatus,
  type BacktestRunRow,
} from '@/lib/backtests';
import { runBacktest } from '@backtest/engine';
import type { BacktestParams, StrategyRulesLike } from '@backtest/types';
import { getCryptoStrategyVersion } from '@/lib/crypto/strategy-version';
import { DEFAULT_BACKTEST_PARAMS } from '@/lib/backtest-runner';
import { loadCryptoGuardConfig } from '@crypto/config';

export async function executeCryptoBacktest(input: {
  periodStart: string;
  periodEnd: string;
  params?: Partial<BacktestParams>;
}): Promise<Awaited<ReturnType<typeof runBacktest>>> {
  const symbols = (cryptoStrategy.symbols as string[]) ?? ['BTC/USD'];
  const rules = cryptoStrategy.rules as StrategyRulesLike;
  const params: BacktestParams = { ...DEFAULT_BACKTEST_PARAMS, ...input.params };
  const tradingDates = calendarDaysBetween(input.periodStart, input.periodEnd);
  if (tradingDates.length < 5) throw new Error('Te weinig dagen in de gekozen periode');

  const barsBySymbol = await fetchCryptoDailyBars(symbols, input.periodStart, input.periodEnd);
  const btcBars = barsBySymbol['BTC/USD'] ?? [];

  const guardCfg = loadCryptoGuardConfig();
  const guardEnv: Record<string, string> = {
    MAX_POSITIONS: String(rules.max_positions),
    MAX_POSITION_SIZE_PCT: String(guardCfg.maxPositionPct),
    MAX_TOTAL_EXPOSURE_PCT: String(guardCfg.maxBudgetPct),
    MAX_DAILY_DRAWDOWN_PCT: String(guardCfg.maxDailyDrawdownPct),
  };

  return runBacktest({
    tradingDates,
    barsBySymbol,
    spyBars: btcBars,
    symbols,
    rules,
    params,
    guardEnv,
  });
}

export async function startCryptoBacktestRun(input: {
  periodStart: string;
  periodEnd: string;
  params?: Partial<BacktestParams>;
}): Promise<BacktestRunRow> {
  const version = getCryptoStrategyVersion();
  const params = { ...DEFAULT_BACKTEST_PARAMS, ...input.params, assetClass: 'crypto' };
  const run = await createBacktestRun({
    strategyVersion: `crypto-${version}`,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    params,
  });
  await setBacktestStatus(run.id, 'running', { started_at: new Date().toISOString() });
  try {
    const result = await executeCryptoBacktest(input);
    await saveBacktestResults(
      run.id,
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
    await setBacktestStatus(run.id, 'failed', {
      error_message: msg,
      finished_at: new Date().toISOString(),
    });
    throw e;
  }
  return run;
}
