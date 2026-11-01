import { rollBacktestSessionGuards } from './session-guards';

describe('rollBacktestSessionGuards', () => {
  it('clears consecutive-loss breaker latch on a new trading date', () => {
    const rolled = rollBacktestSessionGuards('2026-01-02', '2026-01-03', {
      dayStartEquity: 98_000,
    });
    expect(rolled).toEqual({
      consecutiveLosses: 0,
      circuitBreakerTripped: false,
      sessionPeakEquity: 98_000,
    });
  });

  it('does nothing on the same date', () => {
    expect(rollBacktestSessionGuards('2026-01-02', '2026-01-02', { dayStartEquity: 100_000 })).toBeNull();
  });
});
