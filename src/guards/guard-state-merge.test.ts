import { equitySyncPersistPatch } from './guard-state-merge';

describe('equitySyncPersistPatch (M-10)', () => {
  it('never includes emergencyStop or tradingEnabled even if passed in', () => {
    const patch = equitySyncPersistPatch({
      tradingDay: '2026-11-01',
      sessionPeakEquity: 105,
      // @ts-expect-error intentional stale spread in bug scenario
      emergencyStop: true,
      tradingEnabled: false,
    });
    expect(patch).toEqual({
      tradingDay: '2026-11-01',
      sessionPeakEquity: 105,
    });
  });
});
