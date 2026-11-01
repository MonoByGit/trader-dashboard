import cryptoStrategy from '@/crypto-strategy.json';
import { dailyBarsFromHourly } from '@/lib/backtest-bars';
import { fetchCryptoDailyBars, cryptoTradingDates } from '@/lib/backtest-crypto-bars';
import { alignBenchmarkBarsToTradingDates } from '@backtest/bar-align';
import { runBacktest } from '@backtest/engine';
import type { BacktestParams, StrategyRulesLike } from '@backtest/types';
import { DEFAULT_BACKTEST_PARAMS } from '@/lib/backtest-runner';
import { toTradingDateString } from '../../src/dates/trading-date';

export async function executeCryptoBacktest(input: {
  periodStart: string;
  periodEnd: string;
  params?: Partial<BacktestParams>;
}) {
  const symbols = cryptoStrategy.symbols as string[];
  const rules = { ...cryptoStrategy.rules, vix_threshold: 999 } as StrategyRulesLike;
  const params: BacktestParams = {
    ...DEFAULT_BACKTEST_PARAMS,
    ...input.params,
    barMode: input.params?.barMode ?? DEFAULT_BACKTEST_PARAMS.barMode,
  };
  const periodStart = toTradingDateString(input.periodStart);
  const periodEnd = toTradingDateString(input.periodEnd);
  const tradingDates = cryptoTradingDates(periodStart, periodEnd);

  let hourlyBarsBySymbol: Record<string, import('@backtest/types').DailyBar[]> | undefined;
  let barsBySymbol: Record<string, import('@backtest/types').DailyBar[]>;
  const fetchSymbols = Array.from(new Set([...symbols, 'BTC/USD']));
  if (params.barMode === 'hourly') {
    hourlyBarsBySymbol = await fetchCryptoDailyBars(
      fetchSymbols,
      periodStart,
      periodEnd,
      '1Hour',
    );
    barsBySymbol = dailyBarsFromHourly(hourlyBarsBySymbol);
  } else {
    barsBySymbol = await fetchCryptoDailyBars(fetchSymbols, periodStart, periodEnd);
  }

  const rawBtc = barsBySymbol['BTC/USD'] ?? [];
  const btcBars = alignBenchmarkBarsToTradingDates(tradingDates, rawBtc);

  return runBacktest({
    tradingDates,
    barsBySymbol,
    hourlyBarsBySymbol,
    spyBars: btcBars,
    symbols,
    rules,
    params,
  });
}
