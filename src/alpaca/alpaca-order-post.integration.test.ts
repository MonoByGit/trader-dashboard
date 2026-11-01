/** @jest-environment node */
import { jest } from '@jest/globals';

describe('placeOrder client_order_id recovery', () => {
  it('returns existing order after POST 503 when lookup succeeds', async () => {
    jest.resetModules();
    const clientOrderId = 'mktopen-run123-QQQ-buy';
    const existing = {
      id: 'ord-existing',
      symbol: 'QQQ',
      side: 'buy',
      qty: '1',
      filled_qty: '0',
      type: 'market',
      status: 'new',
      submitted_at: '2026-11-01T12:00:00Z',
      filled_at: null,
      filled_avg_price: null,
      limit_price: null,
      stop_price: null,
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/v2/orders') && init?.method === 'POST') {
        return new Response('upstream error', { status: 503 });
      }
      if (url.includes('orders:by_client_order_id')) {
        return new Response(JSON.stringify(existing), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }) as typeof fetch;

    process.env.ALPACA_API_KEY = 'k';
    process.env.ALPACA_SECRET_KEY = 's';
    process.env.ALPACA_PAPER = 'true';

    try {
      const { alpaca } = await import('../../web/lib/alpaca.js');
      const order = await alpaca.placeOrder({
        symbol: 'QQQ',
        qty: 1,
        side: 'buy',
        type: 'market',
        time_in_force: 'day',
        client_order_id: clientOrderId,
      });
      expect(order.id).toBe('ord-existing');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
