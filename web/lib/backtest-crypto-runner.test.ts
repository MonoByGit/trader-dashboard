import { alignBenchmarkBarsToTradingDates } from '@backtest/bar-align';
import { runBacktest } from '@backtest/engine';
import type { DailyBar } from '@backtest/types';

describe('crypto backtest benchmark alignment', () => {
  it('buy-and-hold BTC benchmark moves when bars start after first trading date', () => {
    const tradingDates = ['2025-11-01', '2025-11-02', '2025-11-03'];
    const rawBtc: DailyBar[] = [
      { t: '2025-11-02T00:00:00Z', o: 100, h: 105, l: 99, c: 102, v: 1 },
      { t: '2025-11-03T00:00:00Z', o: 102, h: 120, l: 101, c: 110, v: 1 },
    ];
    const spyBars = alignBenchmarkBarsToTradingDates(tradingDates, rawBtc);
    const flatEth: DailyBar[] = tradingDates.map((d) => ({
      t: `${d}T00:00:00Z`,
      o: 10,
      h: 10,
      l: 10,
      c: 10,
      v: 1,
    }));

    const result = runBacktest({
      tradingDates,
      barsBySymbol: { 'BTC/USD': rawBtc, 'ETH/USD': flatEth },
      spyBars,
      symbols: ['BTC/USD', 'ETH/USD'],
      rules: {
        max_positions: 1,
        hold_overnight: false,
        hard_stop_pct: 0.02,
        take_profit_pct: 0.05,
        rsi_min: 99,
        rsi_max: 100,
        volume_ratio_min: 0.9,
        vix_threshold: 30,
      },
      params: {
        initialCapital: 10_000,
        fillMode: 'next_open',
        slippageBps: 0,
        commissionPerShare: 0,
        minCommissionUsd: 0,
      },
    });

    expect(result.equityCurve.length).toBeGreaterThanOrEqual(2);
    const first = result.equityCurve[0]!.spyEquity;
    const last = result.equityCurve[result.equityCurve.length - 1]!.spyEquity;
    expect(last).toBeGreaterThan(first);
    expect(result.metrics.spyTotalReturnPct).toBeGreaterThan(0);
  });
});
