import cryptoStrategy from '@/crypto-strategy.json';
import { dailyBarsFromHourly } from '@/lib/backtest-bars';
import { fetchCryptoDailyBars, cryptoTradingDates } from '@/lib/backtest-crypto-bars';
import { runBacktest } from '@backtest/engine';
import type { BacktestParams, StrategyRulesLike } from '@backtest/types';
import { DEFAULT_BACKTEST_PARAMS } from '@/lib/backtest-runner';

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
  const tradingDates = cryptoTradingDates(input.periodStart, input.periodEnd);

  let hourlyBarsBySymbol: Record<string, import('@backtest/types').DailyBar[]> | undefined;
  let barsBySymbol: Record<string, import('@backtest/types').DailyBar[]>;
  if (params.barMode === 'hourly') {
    hourlyBarsBySymbol = await fetchCryptoDailyBars(
      [...symbols, 'BTC/USD'],
      input.periodStart,
      input.periodEnd,
      '1Hour',
    );
    barsBySymbol = dailyBarsFromHourly(hourlyBarsBySymbol);
    delete hourlyBarsBySymbol['BTC/USD'];
  } else {
    barsBySymbol = await fetchCryptoDailyBars(symbols, input.periodStart, input.periodEnd);
  }

  const btcBars = barsBySymbol['BTC/USD'] ?? [];
  delete barsBySymbol['BTC/USD'];

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
