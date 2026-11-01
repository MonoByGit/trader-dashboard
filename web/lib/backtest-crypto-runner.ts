import cryptoStrategy from '@/crypto-strategy.json';
import { dailyBarsFromHourly } from '@/lib/backtest-bars';
import { fetchCryptoDailyBars, cryptoTradingDates } from '@/lib/backtest-crypto-bars';
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
  if (params.barMode === 'hourly') {
    hourlyBarsBySymbol = await fetchCryptoDailyBars(
      [...symbols, 'BTC/USD'],
      periodStart,
      periodEnd,
      '1Hour',
    );
    barsBySymbol = dailyBarsFromHourly(hourlyBarsBySymbol);
    delete hourlyBarsBySymbol['BTC/USD'];
  } else {
    barsBySymbol = await fetchCryptoDailyBars([...symbols, 'BTC/USD'], periodStart, periodEnd);
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
