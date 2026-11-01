// REPRO B1: Alpaca DELETE /v2/orders/{id} answers 204 No Content; alpaca.del() must not call res.json() on empty body.
import { jest } from '@jest/globals';

const logGuardEvent = jest.fn(async () => {});

jest.unstable_mockModule('../alpaca-bars', () => ({
  DEFAULT_DAILY_BAR_LOOKBACK_DAYS: 40,
  fetchCryptoBars: jest.fn(),
  fetchStockDailyBars: jest.fn(),
}));
jest.unstable_mockModule('../alpaca-startup', () => ({ logAlpacaModeAtStartup: () => {} }));
jest.unstable_mockModule('@/lib/db', () => ({ hasDb: () => false, dbQuery: jest.fn(), dbRun: jest.fn() }));
jest.unstable_mockModule('@/lib/migrate', () => ({ ensureSchema: jest.fn(async () => {}) }));
jest.unstable_mockModule('@/lib/guards/service', () => ({ logGuardEvent }));

const brokerOrders: Record<string, string> = {};
const calls: string[] = [];

function installFetch() {
  brokerOrders['sl-1'] = 'new';
  calls.length = 0;
  (globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = jest.fn(
    async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      const m = init?.method ?? 'GET';
      calls.push(`${m} ${u.replace(/^https:\/\/[^/]+/, '')}`);
      if (m === 'DELETE' && u.endsWith('/v2/orders/sl-1')) {
        brokerOrders['sl-1'] = 'canceled';
        return new Response(null, { status: 204 });
      }
      if (m === 'GET' && u.includes('/v2/orders/sl-1')) {
        return Response.json({ id: 'sl-1', status: brokerOrders['sl-1'] });
      }
      if (m === 'GET' && u.includes('/v2/orders?status=open')) {
        return Response.json(
          brokerOrders['sl-1'] === 'canceled'
            ? []
            : [
                {
                  id: 'sl-1',
                  symbol: 'BTC/USD',
                  side: 'sell',
                  type: 'stop_limit',
                  status: 'new',
                  limit_price: '89000',
                },
              ],
        );
      }
      if (m === 'GET' && u.endsWith('/v2/positions')) {
        return Response.json([
          {
            symbol: 'BTCUSD',
            qty: '0.01',
            qty_available: brokerOrders['sl-1'] === 'canceled' ? '0.01' : '0',
          },
        ]);
      }
      if (m === 'POST' && u.endsWith('/v2/orders')) return Response.json({ id: 'mkt-1', status: 'new' });
      if (m === 'GET' && u.includes('/v2/orders/mkt-1')) return Response.json({ id: 'mkt-1', status: 'filled' });
      if (m === 'DELETE' && u.includes('/v2/positions/')) return new Response(null, { status: 204 });
      return new Response('nope', { status: 404 });
    },
  ) as typeof fetch;
}

describe('REPRO B1 — cancel 204 treated as failure', () => {
  beforeEach(() => {
    process.env.ALPACA_API_KEY = 'x';
    process.env.ALPACA_SECRET_KEY = 'y';
    installFetch();
    logGuardEvent.mockClear();
  });

  it('exitCryptoPosition should sell after a successful (204) cancel', async () => {
    const { exitCryptoPosition } = await import('./exit-crypto-position');
    const r = await exitCryptoPosition('BTC/USD', 'software_stop');
    expect(brokerOrders['sl-1']).toBe('canceled');
    expect(r).toEqual({ exited: true, orderId: 'mkt-1' });
  });

  it('manual close (M-7) should close after a successful (204) cancel', async () => {
    const { closePositionAfterCancelingOrders } = await import('../alpaca-position-close');
    await expect(closePositionAfterCancelingOrders('BTC/USD')).resolves.toBeDefined();
    expect(brokerOrders['sl-1']).toBe('canceled');
  });
});
