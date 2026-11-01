import { jest } from '@jest/globals';

const store = new Map<string, string>();
const lockRows = new Map<string, { owner: string; updatedAt: number }>();
let lockVerifyFails = false;
const logGuardEvent = jest.fn(async () => {});

await jest.unstable_mockModule('@/lib/db', () => ({
  hasDb: () => true,
  dbQuery: jest.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes('UPDATE settings SET updated_at') && sql.includes('RETURNING key')) {
      if (lockVerifyFails) return [];
      const key = params?.[0] as string;
      const owner = params?.[1] as string;
      if (lockRows.get(key)?.owner === owner) return [{ key }];
      return [];
    }
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
    const key = params?.[0] as string;
    const val = store.get(key);
    return val !== undefined ? [{ value: val, key }] : [];
  }),
  dbRun: jest.fn(async (sql: string, params?: unknown[]) => {
    const key = params?.[0] as string;
    if (sql.includes('AND value')) {
      const owner = params?.[1] as string;
      if (lockRows.get(key)?.owner === owner) lockRows.delete(key);
      return;
    }
    store.delete(key);
  }),
}));

await jest.unstable_mockModule('@/lib/migrate', () => ({
  ensureSchema: jest.fn(async () => {}),
}));

await jest.unstable_mockModule('@/lib/guards/service', () => ({
  logGuardEvent,
}));

const openOrders = jest.fn<() => Promise<{ id: string; symbol: string; side: string; type: string }[]>>();
const getOrder = jest.fn<() => Promise<{ status: string }>>();
const cancelOrder = jest.fn<() => Promise<unknown>>();
const positions = jest.fn<
  () => Promise<{ symbol: string; qty: string; qty_available?: string }[]>
>();
const placeOrder = jest.fn<() => Promise<{ id: string }>>();

await jest.unstable_mockModule('@/lib/alpaca', () => ({
  alpaca: {
    openOrders,
    getOrder,
    cancelOrder,
    positions,
    placeOrder,
  },
}));

const { exitCryptoPosition } = await import('./exit-crypto-position');
const { clearInProcessExitLocksForTests } = await import('./exit-lock');

describe('exitCryptoPosition', () => {
  beforeEach(() => {
    store.clear();
    lockRows.clear();
    lockVerifyFails = false;
    clearInProcessExitLocksForTests();
    openOrders.mockReset();
    cancelOrder.mockReset();
    getOrder.mockReset();
    positions.mockReset();
    placeOrder.mockReset();
    logGuardEvent.mockClear();
    getOrder.mockResolvedValue({ status: 'canceled' });
    placeOrder.mockResolvedValue({ id: 'mkt-1' });
  });

  it('cleans up crypto_stop and crypto_tp keys after a successful exit', async () => {
    store.set('crypto_stop:BTCUSD', '{"stopPrice":1,"qty":1}');
    store.set('crypto_tp:BTCUSD', '{"tpPrice":2}');
    store.set('crypto_stop:BTC/USD', 'legacy');
    openOrders.mockResolvedValue([]);
    positions.mockResolvedValue([{ symbol: 'BTCUSD', qty: '0.01', qty_available: '0.01' }]);
    getOrder.mockResolvedValue({ status: 'filled' });

    const result = await exitCryptoPosition('BTC/USD', 'software_stop');

    expect(result.exited).toBe(true);
    expect(store.has('crypto_stop:BTCUSD')).toBe(false);
    expect(store.has('crypto_tp:BTCUSD')).toBe(false);
    expect(store.has('crypto_stop:BTC/USD')).toBe(false);
  });

  it('does not sell when qty_available is 0 but still cleans keys', async () => {
    store.set('crypto_stop:BTCUSD', '{}');
    openOrders.mockResolvedValue([]);
    positions.mockResolvedValue([{ symbol: 'BTCUSD', qty: '0', qty_available: '0' }]);

    const result = await exitCryptoPosition('BTCUSD', 'software_stop');

    expect(result).toEqual({ exited: false, skippedReason: 'no_qty' });
    expect(placeOrder).not.toHaveBeenCalled();
    expect(store.has('crypto_stop:BTCUSD')).toBe(false);
  });

  it('does not sell when cancel fails', async () => {
    openOrders.mockResolvedValue([{ id: 'sl-1', symbol: 'BTCUSD', side: 'sell', type: 'stop_limit' }]);
    cancelOrder.mockRejectedValue(new Error('network'));
    getOrder.mockResolvedValue({ status: 'accepted' });
    positions.mockResolvedValue([{ symbol: 'BTCUSD', qty: '0.01', qty_available: '0.01' }]);

    const result = await exitCryptoPosition('BTCUSD', 'software_stop');

    expect(result).toEqual({ exited: false, skippedReason: 'cancel_failed' });
    expect(placeOrder).not.toHaveBeenCalled();
    expect(logGuardEvent).toHaveBeenCalledWith(
      'crypto_exit_cancel_fail',
      expect.any(String),
      expect.objectContaining({ symbol: 'BTCUSD' }),
    );
  });

  it('skips a second concurrent exit on the same symbol (lock)', async () => {
    openOrders.mockResolvedValue([{ id: 'sl-1', symbol: 'BTCUSD', side: 'sell', type: 'limit' }]);
    let unblock = () => {};
    const gate = new Promise<void>((r) => {
      unblock = r;
    });
    cancelOrder.mockImplementation(async () => {
      await gate;
    });
    getOrder.mockResolvedValue({ status: 'canceled' });
    positions.mockResolvedValue([{ symbol: 'BTCUSD', qty: '0.01', qty_available: '0.01' }]);

    const first = exitCryptoPosition('BTCUSD', 'software_stop');
    const second = await exitCryptoPosition('BTCUSD', 'take_profit');

    expect(second).toEqual({ exited: false, skippedReason: 'locked' });
    expect(logGuardEvent).toHaveBeenCalledWith(
      'crypto_exit_locked',
      expect.any(String),
      expect.objectContaining({ symbol: 'BTCUSD' }),
    );
    unblock();
    getOrder.mockResolvedValue({ status: 'filled' });
    await first;
  });

  it('does not sell when DB lock is lost before placeOrder', async () => {
    openOrders.mockResolvedValue([]);
    positions.mockResolvedValue([{ symbol: 'BTCUSD', qty: '0.01', qty_available: '0.01' }]);
    lockVerifyFails = true;

    const result = await exitCryptoPosition('BTCUSD', 'software_stop');

    expect(result).toEqual({ exited: false, skippedReason: 'lock_lost' });
    expect(placeOrder).not.toHaveBeenCalled();
    expect(logGuardEvent).toHaveBeenCalledWith(
      'crypto_exit_lock_lost',
      expect.any(String),
      expect.objectContaining({ symbol: 'BTCUSD' }),
    );
  });

  it('logs crypto_exit_sell_unfilled when market sell does not fill in time', async () => {
    store.set('crypto_stop:BTCUSD', '{}');
    openOrders.mockResolvedValue([]);
    positions.mockResolvedValue([{ symbol: 'BTCUSD', qty: '0.01', qty_available: '0.01' }]);
    getOrder.mockResolvedValue({ status: 'accepted' });

    const result = await exitCryptoPosition('BTCUSD', 'software_stop');

    expect(result.exited).toBe(true);
    expect(logGuardEvent).toHaveBeenCalledWith(
      'crypto_exit_sell_unfilled',
      expect.stringContaining('mkt-1'),
      expect.objectContaining({ symbol: 'BTCUSD', orderId: 'mkt-1' }),
    );
    expect(store.has('crypto_stop:BTCUSD')).toBe(true);
  });
});
