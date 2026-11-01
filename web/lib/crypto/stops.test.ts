import { jest } from '@jest/globals';

const store = new Map<string, string>();

await jest.unstable_mockModule('@/lib/db', () => ({
  hasDb: () => true,
  dbQuery: jest.fn(async (_sql: string, params?: unknown[]) => {
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
const positions = jest.fn<() => Promise<{ symbol: string; qty: string }[]>>();

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
  logGuardEvent: jest.fn(async () => {}),
}));

const { saveCryptoStop, enforceSoftwareCryptoStops, protectCryptoPositionAfterBuy } = await import('./stops');

describe('enforceSoftwareCryptoStops', () => {
  beforeEach(() => {
    store.clear();
    placeOrder.mockReset();
    openOrders.mockReset();
    cancelOrder.mockReset();
    openOrders.mockResolvedValue([]);
    placeOrder.mockResolvedValue({ id: 'mkt-sell-1' });
  });

  it('fires when stop saved via saveCryptoStop (BTC/USD) and position symbol is BTCUSD', async () => {
    await saveCryptoStop('BTC/USD', 90_000, 0.01);
    expect(store.has('crypto_stop:BTCUSD')).toBe(true);
    expect(store.has('crypto_stop:BTC/USD')).toBe(false);

    const result = await enforceSoftwareCryptoStops('BTCUSD', 89_000);

    expect(result).toEqual({ triggered: true, orderId: 'mkt-sell-1' });
    expect(placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: 'BTCUSD',
        qty: 0.01,
        side: 'sell',
        type: 'market',
      }),
    );
  });

  it('does not fire when price is above stop', async () => {
    await saveCryptoStop('BTC/USD', 90_000, 0.01);
    const result = await enforceSoftwareCryptoStops('BTCUSD', 91_000);
    expect(result).toEqual({ triggered: false });
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it('falls back to legacy slash key and migrates to compact key', async () => {
    store.set('crypto_stop:BTC/USD', JSON.stringify({ stopPrice: 88_000, qty: 0.02 }));

    const result = await enforceSoftwareCryptoStops('BTCUSD', 87_500);

    expect(result).toEqual({ triggered: true, orderId: 'mkt-sell-1' });
    expect(store.has('crypto_stop:BTC/USD')).toBe(false);
    expect(store.get('crypto_stop:BTCUSD')).toBe(JSON.stringify({ stopPrice: 88_000, qty: 0.02 }));
    expect(placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({ qty: 0.02, side: 'sell', type: 'market' }),
    );
  });

  it('does not fire when a working stop-limit still protects above the market (B-6)', async () => {
    await saveCryptoStop('BTC/USD', 90_000, 0.01);
    openOrders.mockResolvedValue([
      {
        id: 'sl-1',
        symbol: 'BTCUSD',
        side: 'sell',
        type: 'stop_limit',
        status: 'accepted',
        limit_price: '89550',
      },
    ]);

    const result = await enforceSoftwareCryptoStops('BTCUSD', 89_600);

    expect(result).toEqual({ triggered: false });
    expect(placeOrder).not.toHaveBeenCalled();
    expect(cancelOrder).not.toHaveBeenCalled();
  });

  it('cancels a gapped stop-limit and market-sells (B-6)', async () => {
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

    const result = await enforceSoftwareCryptoStops('BTCUSD', 89_000);

    expect(cancelOrder).toHaveBeenCalledWith('sl-1');
    expect(result).toEqual({ triggered: true, orderId: 'mkt-sell-1' });
  });
});

describe('protectCryptoPositionAfterBuy (B-5)', () => {
  beforeEach(() => {
    store.clear();
    placeOrder.mockReset();
    getOrder.mockReset();
    positions.mockReset();
  });

  it('places stop-limit with filled qty, not ordered qty', async () => {
    getOrder.mockResolvedValue({ status: 'filled', filled_qty: '0.0098' });
    placeOrder.mockResolvedValue({ id: 'stop-limit-1' });

    const result = await protectCryptoPositionAfterBuy('BTC/USD', 'buy-1', 90_000);

    expect(result.qty).toBe(0.0098);
    expect(placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({ qty: 0.0098, type: 'stop_limit', side: 'sell' }),
    );
    expect(store.get('crypto_stop:BTCUSD')).toBe(
      JSON.stringify({ stopPrice: 90_000, qty: 0.0098 }),
    );
  });
});
