/** Lock gate uses real verifyRoutineRunLock (no mock of routine-runs). */
import { jest } from '@jest/globals';

describe('gateBuyIfLockLost with verifyRoutineRunLock', () => {
  it('blocks when lock row is missing', async () => {
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

    const { gateBuyIfLockLost } = await import('@/lib/buy-idempotency');
    const gate = await gateBuyIfLockLost('run-not-held', 'QQQ');
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/lock/i);
  });
});
