import { jest } from '@jest/globals';

const store = new Map<string, string>();
const logGuardEvent = jest.fn(async () => {});

await jest.unstable_mockModule('@/lib/db', () => ({
  hasDb: () => true,
  dbQuery: jest.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes("INTERVAL '2 minutes'")) {
      const key = params?.[0] as string;
      if (store.has(key)) return [];
      store.set(key, params?.[1] as string);
      return [{ key }];
    }
    const key = params?.[0] as string;
    const val = store.get(key);
    return val ? [{ value: val }] : [];
  }),
  dbRun: jest.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes('DELETE')) {
      const key = params?.[0] as string;
      store.delete(key);
      return;
    }
    const key = params?.[0] as string;
    const val = params?.[1] as string;
    store.set(key, val);
  }),
}));

await jest.unstable_mockModule('@/lib/migrate', () => ({
  ensureSchema: jest.fn(async () => {}),
}));

const placeOrder = jest.fn<() => Promise<{ id: string }>>();
const openOrders = jest.fn<
  () => Promise<
    { id: string; symbol: string; side: string; type: string; status: string; limit_price: string | null }[]
  >
>();
const cancelOrder = jest.fn<() => Promise<unknown>>();
const getOrder = jest.fn<
  () => Promise<{ status: string; filled_qty: string }>
>();
const positions = jest.fn<
  () => Promise<{ symbol: string; qty: string; qty_available?: string }[]>
>();

await jest.unstable_mockModule('@/lib/alpaca', () => ({
  alpaca: {
    placeOrder,
    openOrders,
    cancelOrder,
    getOrder,
    positions,
  },
}));

await jest.unstable_mockModule('@/lib/guards/service', () => ({
  logGuardEvent,
}));

const { saveCryptoStop, enforceSoftwareCryptoStops, protectCryptoPositionAfterBuy } = await import('./stops');

describe('enforceSoftwareCryptoStops', () => {
  beforeEach(() => {
    store.clear();
    placeOrder.mockReset();
    openOrders.mockReset();
    cancelOrder.mockReset();
    getOrder.mockReset();
    positions.mockReset();
    logGuardEvent.mockClear();
    openOrders.mockResolvedValue([]);
    placeOrder.mockResolvedValue({ id: 'mkt-sell-1' });
  });

  it('fires when stop saved via saveCryptoStop (BTC/USD) and position symbol is BTCUSD', async () => {
    await saveCryptoStop('BTC/USD', 90_000, 0.01);
    cancelOrder.mockResolvedValue(undefined);
    getOrder.mockResolvedValue({ status: 'canceled', filled_qty: '0' });
    positions.mockResolvedValue([{ symbol: 'BTCUSD', qty: '0.01', qty_available: '0.01' }]);

    const result = await enforceSoftwareCryptoStops('BTCUSD', 89_000);

    expect(result).toEqual({ triggered: true, orderId: 'mkt-sell-1' });
    expect(placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: 'BTCUSD', qty: 0.01, side: 'sell', type: 'market' }),
    );
  });

  it('does not fire when price is above stop', async () => {
    await saveCryptoStop('BTC/USD', 90_000, 0.01);
    const result = await enforceSoftwareCryptoStops('BTCUSD', 91_000);
    expect(result).toEqual({ triggered: false });
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it('does not fire when a partially_filled stop-limit still protects (B-6)', async () => {
    await saveCryptoStop('BTC/USD', 90_000, 0.01);
    openOrders.mockResolvedValue([
      {
        id: 'sl-1',
        symbol: 'BTCUSD',
        side: 'sell',
        type: 'stop_limit',
        status: 'partially_filled',
        limit_price: '89550',
      },
    ]);

    const result = await enforceSoftwareCryptoStops('BTCUSD', 89_600);
    expect(result).toEqual({ triggered: false });
    expect(cancelOrder).not.toHaveBeenCalled();
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it('does not market-sell when cancel ends filled (422 path)', async () => {
    await saveCryptoStop('BTC/USD', 90_000, 0.01);
    openOrders.mockResolvedValue([
      {
        id: 'sl-1',
        symbol: 'BTCUSD',
        side: 'sell',
        type: 'stop_limit',
        status: 'new',
        limit_price: '89550',
      },
    ]);
    cancelOrder.mockRejectedValue(new Error('Alpaca DELETE: 422'));
    getOrder.mockResolvedValue({ status: 'filled', filled_qty: '0.01' });

    const result = await enforceSoftwareCryptoStops('BTCUSD', 89_000);
    expect(result).toEqual({ triggered: false });
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it('does not sell when cancel fails', async () => {
    await saveCryptoStop('BTC/USD', 90_000, 0.01);
    openOrders.mockResolvedValue([
      {
        id: 'sl-1',
        symbol: 'BTCUSD',
        side: 'sell',
        type: 'stop_limit',
        status: 'new',
        limit_price: '89550',
      },
    ]);
    cancelOrder.mockRejectedValue(new Error('network down'));
    getOrder.mockResolvedValue({ status: 'accepted', filled_qty: '0' });

    const result = await enforceSoftwareCryptoStops('BTCUSD', 89_000);
    expect(result).toEqual({ triggered: false });
    expect(placeOrder).not.toHaveBeenCalled();
    expect(logGuardEvent).toHaveBeenCalledWith(
      'crypto_exit_cancel_fail',
      expect.any(String),
      expect.objectContaining({ symbol: 'BTCUSD' }),
    );
  });

  it('sells remaining qty_available after confirmed cancel', async () => {
    await saveCryptoStop('BTC/USD', 90_000, 0.01);
    openOrders.mockResolvedValue([
      {
        id: 'sl-1',
        symbol: 'BTCUSD',
        side: 'sell',
        type: 'stop_limit',
        status: 'new',
        limit_price: '89550',
      },
    ]);
    cancelOrder.mockResolvedValue(undefined);
    getOrder
      .mockResolvedValueOnce({ status: 'pending_cancel', filled_qty: '0' })
      .mockResolvedValueOnce({ status: 'canceled', filled_qty: '0' })
      .mockResolvedValue({ status: 'filled', filled_qty: '0.008' });
    positions.mockResolvedValue([{ symbol: 'BTCUSD', qty: '0.01', qty_available: '0.008' }]);

    const result = await enforceSoftwareCryptoStops('BTCUSD', 89_000);
    expect(result.triggered).toBe(true);
    expect(placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({ qty: 0.008, type: 'market' }),
    );
  });

  it('does nothing when remaining qty is 0 after cancel', async () => {
    await saveCryptoStop('BTC/USD', 90_000, 0.01);
    openOrders.mockResolvedValue([
      {
        id: 'sl-1',
        symbol: 'BTCUSD',
        side: 'sell',
        type: 'stop_limit',
        status: 'new',
        limit_price: '89550',
      },
    ]);
    cancelOrder.mockResolvedValue(undefined);
    getOrder.mockResolvedValue({ status: 'canceled', filled_qty: '0' });
    positions.mockResolvedValue([{ symbol: 'BTCUSD', qty: '0', qty_available: '0' }]);

    const result = await enforceSoftwareCryptoStops('BTCUSD', 89_000);
    expect(result).toEqual({ triggered: false });
    expect(placeOrder).not.toHaveBeenCalled();
  });
});

describe('protectCryptoPositionAfterBuy (B-5)', () => {
  beforeEach(() => {
    store.clear();
    placeOrder.mockReset();
    getOrder.mockReset();
    positions.mockReset();
  });

  it('places stop-limit with qty_available after fill', async () => {
    getOrder
      .mockResolvedValueOnce({ status: 'new', filled_qty: '0' })
      .mockResolvedValue({ status: 'filled', filled_qty: '0.01' });
    positions.mockResolvedValue([{ symbol: 'BTCUSD', qty: '0.01', qty_available: '0.0097' }]);
    placeOrder.mockResolvedValue({ id: 'stop-limit-1' });

    const result = await protectCryptoPositionAfterBuy('BTC/USD', 'buy-1', 90_000, {
      poll: { attempts: 3, delayMs: 0 },
    });

    expect(result.qty).toBe(0.0097);
    expect(placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({ qty: 0.0097, type: 'stop_limit', side: 'sell' }),
    );
  });
});
