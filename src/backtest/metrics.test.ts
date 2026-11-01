import {
  annualizedReturnPct,
  maxDrawdownPct,
  sharpeRatio,
  totalReturnPct,
  computeMetrics,
} from './metrics';

describe('backtest metrics', () => {
  it('max drawdown from peak', () => {
    expect(maxDrawdownPct([100, 110, 99, 105])).toBeCloseTo(10, 1);
  });

  it('annualized return scales with days', () => {
    const total = totalReturnPct(100, 110);
    expect(total).toBeCloseTo(10);
    const ann = annualizedReturnPct(total, 252);
    expect(ann).toBeCloseTo(10, 0);
  });

  it('sharpe handles flat series', () => {
    expect(sharpeRatio([0, 0, 0, 0])).toBeNull();
  });

  it('computeMetrics merges strategy and spy', () => {
    const curve = [
      { date: '2026-01-02', equity: 100_000, cash: 50_000, exposure: 50_000, spyEquity: 100_000 },
      { date: '2026-01-03', equity: 105_000, cash: 50_000, exposure: 55_000, spyEquity: 102_000 },
    ];
    const { strategy, spy } = computeMetrics(curve, []);
    expect(strategy.totalReturnPct).toBeCloseTo(5);
    expect(spy.spyTotalReturnPct).toBeCloseTo(2);
    expect(spy.benchmarkSymbol).toBe('SPY');
  });

  it('tags benchmark symbol for crypto runs', () => {
    const curve = [
      { date: '2026-01-02', equity: 100_000, cash: 100_000, exposure: 0, spyEquity: 100_000 },
      { date: '2026-01-03', equity: 100_000, cash: 100_000, exposure: 0, spyEquity: 110_000 },
    ];
    const { spy } = computeMetrics(curve, [], 'BTC');
    expect(spy.benchmarkSymbol).toBe('BTC');
  });
});
