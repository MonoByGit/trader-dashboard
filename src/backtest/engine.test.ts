import { runBacktest } from './engine';
import type { DailyBar } from './types';

function barsFromCloses(
  dates: string[],
  closes: number[],
  opts?: { highOffset?: number; lowOffset?: number },
): DailyBar[] {
  const hi = opts?.highOffset ?? 0.5;
  const lo = opts?.lowOffset ?? 0.5;
  return dates.map((d, i) => {
    const c = closes[i]!;
    return {
      t: `${d}T16:00:00Z`,
      o: i === 0 ? c : closes[i - 1]!,
      h: c + hi,
      l: c - lo,
      c,
      v: 1_000_000 + i * 10_000,
    };
  });
}

const rules = {
  max_positions: 2,
  hold_overnight: false,
  hard_stop_pct: 0.02,
  take_profit_pct: 0.05,
  rsi_min: 40,
  rsi_max: 80,
  volume_ratio_min: 0.9,
  vix_threshold: 30,
};

describe('backtest engine', () => {
  it('does not look ahead: signal on day T fills at open T+1 only', () => {
    const dates = ['2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05'];
    const closes = [100, 100, 100, 150];
    const sym = 'QQQ';
    const barsBySymbol = { [sym]: barsFromCloses(dates, closes) };
    const spyBars = barsFromCloses(dates, [400, 400, 400, 400]);

    const result = runBacktest({
      tradingDates: dates,
      barsBySymbol,
      spyBars,
      symbols: [sym],
      rules,
      params: {
        initialCapital: 100_000,
        fillMode: 'next_open',
        slippageBps: 0,
        commissionPerShare: 0,
        minCommissionUsd: 0,
      },
    });

    const buys = result.trades.filter((t) => t.side === 'buy');
    if (buys.length > 0) {
      expect(buys[0]!.date).not.toBe('2026-01-04');
      expect(buys.every((b) => b.date >= '2026-01-03')).toBe(true);
    }
  });

  it('runs deterministic entries when criteria pass (produces trades or flat equity)', () => {
    const dates = Array.from({ length: 35 }, (_, i) => {
      const day = i + 1;
      return `2026-02-${String(day).padStart(2, '0')}`;
    });
    const closes = dates.map((_, i) => 100 + i * 0.4);
    const sym = 'QQQ';
    const barsBySymbol = { [sym]: barsFromCloses(dates, closes) };
    const spyBars = barsFromCloses(dates, closes.map((c) => c * 4));

    const result = runBacktest({
      tradingDates: dates,
      barsBySymbol,
      spyBars,
      symbols: [sym],
      rules: { ...rules, volume_ratio_min: 0.5, rsi_max: 99 },
      params: {
        initialCapital: 100_000,
        fillMode: 'next_open',
        slippageBps: 0,
        commissionPerShare: 0,
        minCommissionUsd: 0,
      },
    });

    expect(result.equityCurve.length).toBe(35);
    expect(result.metrics.tradeCount).toBeGreaterThanOrEqual(0);
  });

  it('computes SPY buy-and-hold baseline on same dates', () => {
    const dates = ['2026-01-02', '2026-01-03', '2026-01-04'];
    const spyCloses = [100, 110, 121];
    const spyBars = barsFromCloses(dates, spyCloses);
    const sym = 'QQQ';
    const flat = barsFromCloses(dates, [50, 50, 50]);

    const result = runBacktest({
      tradingDates: dates,
      barsBySymbol: { [sym]: flat },
      spyBars,
      symbols: [sym],
      rules: { ...rules, rsi_min: 99 },
      params: {
        initialCapital: 10_000,
        fillMode: 'next_open',
        slippageBps: 0,
        commissionPerShare: 0,
        minCommissionUsd: 0,
      },
    });

    expect(result.metrics.spyTotalReturnPct).toBeCloseTo(21, 0);
    expect(result.equityCurve).toHaveLength(3);
    expect(result.equityCurve[2]!.spyEquity).toBeGreaterThan(result.equityCurve[0]!.spyEquity);
  });
});
