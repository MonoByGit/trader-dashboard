import { loadGuardConfig } from './config.js';
import { evaluateCircuitBreakers } from './circuit-breakers.js';

const config = loadGuardConfig({});

describe('evaluateCircuitBreakers', () => {
  it('trips on daily drawdown beyond limit', () => {
    const r = evaluateCircuitBreakers(
      {
        equity: 96_000,
        dayStartEquity: 100_000,
        sessionPeakEquity: 100_000,
        consecutiveLosses: 0,
        ordersLast10Min: 0,
      },
      config
    );
    expect(r.tripped).toBe(true);
    expect(r.trigger).toBe('daily_drawdown');
  });

  it('trips on peak drawdown beyond limit', () => {
    const r = evaluateCircuitBreakers(
      {
        equity: 94_000,
        dayStartEquity: 94_000,
        sessionPeakEquity: 100_000,
        consecutiveLosses: 0,
        ordersLast10Min: 0,
      },
      config
    );
    expect(r.tripped).toBe(true);
    expect(r.trigger).toBe('peak_drawdown');
  });

  it('passes when within limits', () => {
    const r = evaluateCircuitBreakers(
      {
        equity: 99_500,
        dayStartEquity: 100_000,
        sessionPeakEquity: 100_200,
        consecutiveLosses: 0,
        ordersLast10Min: 1,
      },
      config
    );
    expect(r.tripped).toBe(false);
  });
});
