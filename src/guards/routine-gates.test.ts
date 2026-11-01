import { canRunRoutine } from './routine-gates.js';

describe('canRunRoutine', () => {
  it('blocks all routines when emergency stop is on', () => {
    expect(
      canRunRoutine({
        routine: 'premarket',
        emergencyStop: true,
        tradingEnabled: true,
        circuitBreakerTripped: false,
      }).allowed
    ).toBe(false);
    expect(
      canRunRoutine({
        routine: 'eod',
        emergencyStop: true,
        tradingEnabled: true,
        circuitBreakerTripped: false,
      }).allowed
    ).toBe(false);
  });

  it('blocks market-open on kill switch but allows midday', () => {
    const base = {
      emergencyStop: false,
      tradingEnabled: false,
      circuitBreakerTripped: false,
    };
    expect(canRunRoutine({ ...base, routine: 'market-open' }).allowed).toBe(false);
    expect(canRunRoutine({ ...base, routine: 'midday' }).allowed).toBe(true);
  });

  it('blocks market-open when circuit breaker tripped', () => {
    expect(
      canRunRoutine({
        routine: 'market-open',
        emergencyStop: false,
        tradingEnabled: true,
        circuitBreakerTripped: true,
      }).allowed
    ).toBe(false);
  });

  it('blocks crypto-tick entries on kill switch like market-open', () => {
    expect(
      canRunRoutine({
        routine: 'crypto-tick',
        emergencyStop: false,
        tradingEnabled: false,
        circuitBreakerTripped: false,
      }).allowed,
    ).toBe(false);
  });
});
