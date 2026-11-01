// REPRO B2/B3: DB exit lock expiry + in-process lock cleanup on DB failure.
import { jest } from '@jest/globals';

const lockRows = new Map<string, { owner: string; updatedAt: number }>();
let dbDown = false;
const logGuardEvent = jest.fn(async () => {});

jest.unstable_mockModule('@/lib/db', () => ({
  hasDb: () => true,
  dbQuery: jest.fn(async (sql: string, params?: unknown[]) => {
    if (dbDown) throw new Error('db down');
    if (sql.includes('ON CONFLICT') && sql.includes("INTERVAL '2 minutes'")) {
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
  dbRun: jest.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes('DELETE FROM settings') && sql.includes('AND value')) {
      const key = params?.[0] as string;
      const owner = params?.[1] as string;
      const row = lockRows.get(key);
      if (row?.owner === owner) lockRows.delete(key);
    }
  }),
}));
jest.unstable_mockModule('@/lib/migrate', () => ({ ensureSchema: jest.fn(async () => {}) }));
jest.unstable_mockModule('@/lib/guards/service', () => ({ logGuardEvent }));

const placeOrder = jest.fn(async () => ({ id: 'mkt-1' }));
jest.unstable_mockModule('@/lib/alpaca', () => ({
  alpaca: {
    openOrders: jest.fn(async () => []),
    getOrder: jest.fn(async () => ({ status: 'filled' })),
    cancelOrder: jest.fn(),
    positions: jest.fn(async () => [{ symbol: 'BTCUSD', qty: '0.01', qty_available: '0.01' }]),
    placeOrder,
  },
}));

const { exitCryptoPosition } = await import('./exit-crypto-position');
const { clearInProcessExitLocksForTests } = await import('./exit-lock');

describe('REPRO exit lock', () => {
  beforeEach(() => {
    lockRows.clear();
    dbDown = false;
    clearInProcessExitLocksForTests();
    placeOrder.mockClear();
    logGuardEvent.mockClear();
  });

  it('B2: a lock left by a crashed run (2 days old) must not block exits forever', async () => {
    lockRows.set('crypto_exit_lock:BTCUSD', {
      owner: 'stale-owner',
      updatedAt: Date.now() - 2 * 86400_000,
    });
    const r = await exitCryptoPosition('BTC/USD', 'software_stop');
    expect(r.exited).toBe(true);
  });

  it('B3: a DB error during acquire must not leave the in-process lock set', async () => {
    dbDown = true;
    await expect(exitCryptoPosition('BTC/USD', 'software_stop')).rejects.toThrow('db down');
    dbDown = false;
    const r = await exitCryptoPosition('BTC/USD', 'software_stop');
    expect(r.exited).toBe(true);
  });
});
