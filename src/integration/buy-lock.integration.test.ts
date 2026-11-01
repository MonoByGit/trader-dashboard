/**
 * Lock must be verified before each buy (B-2).
 */
import { jest } from '@jest/globals';

describe('gateBuyIfLockLost', () => {
  it('blocks when run lost the slot lock', async () => {
    jest.resetModules();
    jest.unstable_mockModule('@/lib/db', () => ({
      hasDb: () => true,
      dbQuery: async () => [],
      dbRun: async () => {},
      initDb: async () => {},
      dbTransaction: async (fn: (q: unknown) => Promise<unknown>) =>
        fn(async () => ({ rows: [], rowCount: 0 })),
    }));
    jest.unstable_mockModule('@/lib/migrate', () => ({ ensureSchema: async () => {} }));
    jest.unstable_mockModule('@/lib/routine-runs', () => ({
      verifyRoutineRunLock: async () => false,
    }));

    const { gateBuyIfLockLost } = await import('@/lib/buy-idempotency');
    const gate = await gateBuyIfLockLost('run-a', 'QQQ');
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/lock/i);
  });
});
