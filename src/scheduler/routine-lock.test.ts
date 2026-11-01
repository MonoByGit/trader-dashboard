import { routineLockSlotKey } from './routine-lock.js';

describe('routineLockSlotKey', () => {
  it('uses ET trading date for ETF routines', () => {
    expect(routineLockSlotKey('market-open', '2026-06-03', Date.now())).toBe('2026-06-03');
  });

  it('uses UTC 2h slot for crypto', () => {
    const ms = Date.parse('2026-06-03T05:30:00Z');
    expect(routineLockSlotKey('crypto-scan', '2026-06-03', ms)).toBe('2026-06-03-utc-2');
  });
});
