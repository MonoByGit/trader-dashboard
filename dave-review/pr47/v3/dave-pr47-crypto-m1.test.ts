/** @jest-environment node */
// Dave repro PR 47: M1-crypto exit (exitCryptoPosition) naast een M6-papierpositie in BTC/USD.
import { jest } from '@jest/globals';

const store = new Map<string, string>([['crypto_stop:BTCUSD', JSON.stringify({ stopPrice: 85000, qty: 0.04 })]]);
jest.unstable_mockModule('@/lib/db', () => ({
  hasDb: () => true,
  dbQuery: jest.fn(async (sql: string, params?: unknown[]) => {
    const key = params?.[0] as string;
    if (sql.includes('UPDATE settings SET updated_at') && sql.includes('RETURNING key')) return store.get(key) === params?.[1] ? [{ key }] : [];
    if (sql.includes('ON CONFLICT') && sql.includes("INTERVAL '2 minutes'")) { store.set(key, params?.[1] as string); return [{ key }]; }
    return [];
  }),
  dbRun: jest.fn(async (s: string, params?: unknown[]) => {
    const key = params?.[0] as string;
    if (/AND value=\$2/.test(s) && store.get(key) !== params?.[1]) return;
    store.delete(key);
  }),
}));
jest.unstable_mockModule('@/lib/migrate', () => ({ ensureSchema: jest.fn(async () => {}) }));
jest.unstable_mockModule('@/lib/momentum2/ownership', () => ({ foreignQtyForSymbol: jest.fn(async () => 0.06) }));
jest.unstable_mockModule('@/lib/guards/service', () => ({ logGuardEvent: jest.fn(async () => {}) }));

// Rekening: 0.04 BTC van M1 + 0.06 BTC van M6 (real paper-boek), M6 heeft een m6s- stop_limit.
const orders = [{ id: 'm6stop', client_order_id: 'm6s-m6-btc-breakout-BTC/USD-5000000', symbol: 'BTC/USD', side: 'sell', type: 'stop_limit', qty: '0.06', status: 'new' }];
const cancelled: string[] = [];
const sold: number[] = [];
jest.unstable_mockModule('@/lib/alpaca', () => ({
  alpaca: {
    openOrders: jest.fn(async () => orders.filter((o) => o.status === 'new')),
    cancelOrder: jest.fn(async (id: string) => { cancelled.push(id); const o = orders.find((x) => x.id === id); if (o) o.status = 'canceled'; }),
    getOrder: jest.fn(async (id: string) => orders.find((x) => x.id === id) ?? { id, status: 'filled', filled_qty: String(sold.at(-1) ?? 0) }),
    positions: jest.fn(async () => [{ symbol: 'BTCUSD', qty: '0.1', qty_available: orders.some((o) => o.status === 'new') ? '0.04' : '0.1' }]),
    placeOrder: jest.fn(async (o: { qty: number }) => { sold.push(o.qty); return { id: 'sell-1', status: 'filled' }; }),
    closePosition: jest.fn(),
  },
}));

const { exitCryptoPosition } = await import('@/lib/crypto/exit-crypto-position');

it('C1 M1 software-stop op BTC laat de m6s-stop en de M6-hoeveelheid staan', async () => {
  await exitCryptoPosition('BTC/USD', 'software_stop');
  expect({ cancelled, sold }).toEqual({ cancelled: [], sold: [0.04] });
});
