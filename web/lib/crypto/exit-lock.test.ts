import { jest } from '@jest/globals';

const lockRows = new Map<string, { owner: string; updatedAt: number }>();

jest.unstable_mockModule('@/lib/db', () => ({
  hasDb: () => true,
  dbQuery: jest.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes("INTERVAL '2 minutes'")) {
      const key = params?.[0] as string;
      const owner = params?.[1] as string;
      const now = Date.now();
      const existing = lockRows.get(key);
      if (!existing) {
        lockRows.set(key, { owner, updatedAt: now });
        return [{ key }];
      }
      if (now - existing.updatedAt < 2 * 60 * 1000) return [];
      lockRows.set(key, { owner, updatedAt: now });
      return [{ key }];
    }
    return [];
  }),
  dbRun: jest.fn(async (_sql: string, params?: unknown[]) => {
    const key = params?.[0] as string;
    const owner = params?.[1] as string;
    const row = lockRows.get(key);
    if (row?.owner === owner) lockRows.delete(key);
  }),
}));
jest.unstable_mockModule('@/lib/migrate', () => ({ ensureSchema: jest.fn(async () => {}) }));
jest.unstable_mockModule('@/lib/guards/service', () => ({
  logGuardEvent: jest.fn(async () => {}),
}));

const { acquireExitLock, releaseExitLock, clearInProcessExitLocksForTests } = await import('./exit-lock');

describe('exit lock owner + stale takeover', () => {
  beforeEach(() => {
    lockRows.clear();
    clearInProcessExitLocksForTests();
  });

  it('takes over a stale DB lock', async () => {
    lockRows.set('crypto_exit_lock:BTCUSD', {
      owner: 'old',
      updatedAt: Date.now() - 3 * 60 * 1000,
    });
    const first = await acquireExitLock('BTCUSD');
    expect(first.acquired).toBe(true);
    expect(first.owner).toBeTruthy();
  });

  it('does not release a lock held by another owner', async () => {
    lockRows.set('crypto_exit_lock:BTCUSD', { owner: 'real-owner', updatedAt: Date.now() });
    await releaseExitLock('BTCUSD', 'wrong-owner');
    expect(lockRows.has('crypto_exit_lock:BTCUSD')).toBe(true);
    await releaseExitLock('BTCUSD', 'real-owner');
    expect(lockRows.has('crypto_exit_lock:BTCUSD')).toBe(false);
  });
});
