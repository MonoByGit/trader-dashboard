// REPRO D1: close_position "flat" check must not use qty_available while qty > 0.
import { jest } from '@jest/globals';

const store = new Map<string, string>([
  ['crypto_stop:BTCUSD', JSON.stringify({ stopPrice: 85000, qty: 0.01 })],
]);
const logGuardEvent = jest.fn(async () => {});

jest.unstable_mockModule('@/lib/db', () => ({
  hasDb: () => true,
  dbQuery: jest.fn(async (sql: string, params?: unknown[]) => {
    const key = params?.[0] as string;
    if (sql.includes('UPDATE settings SET updated_at') && sql.includes('RETURNING key')) {
      return store.get(key) === params?.[1] ? [{ key }] : [];
    }
    if (sql.includes('ON CONFLICT') && sql.includes("INTERVAL '2 minutes'")) {
      store.set(key, params?.[1] as string);
      return [{ key }];
    }
    return [];
  }),
  dbRun: jest.fn(async (s: string, params?: unknown[]) => {
    const key = params?.[0] as string;
    if (/AND value=\$2/.test(s) && store.get(key) !== params?.[1]) return;
    store.delete(key);
  }),
}));
jest.unstable_mockModule('@/lib/migrate', () => ({ ensureSchema: jest.fn(async () => {}) }));
jest.unstable_mockModule('@/lib/guards/service', () => ({ logGuardEvent }));

let closeSent = false;
jest.unstable_mockModule('@/lib/alpaca', () => ({
  alpaca: {
    openOrders: jest.fn(async () => []),
    getOrder: jest.fn(),
    cancelOrder: jest.fn(),
    positions: jest.fn(async () => [
      {
        symbol: 'BTCUSD',
        qty: '0.01',
        qty_available: closeSent ? '0' : '0.01',
      },
    ]),
    closePosition: jest.fn(async () => {
      closeSent = true;
      return { id: 'close-1', status: 'pending_new' };
    }),
    placeOrder: jest.fn(),
  },
}));

const { exitCryptoPosition } = await import('./exit-crypto-position');

it('keeps the software stop while the position is not flat yet', async () => {
  await exitCryptoPosition('BTC/USD', 'manual_close', { mode: 'close_position' });
  expect(store.has('crypto_stop:BTCUSD')).toBe(true);
});
