/** @jest-environment node */
import { jest } from '@jest/globals';

await jest.unstable_mockModule('./alpaca-bars', () => ({
  DEFAULT_DAILY_BAR_LOOKBACK_DAYS: 40,
  fetchCryptoBars: jest.fn(),
  fetchStockDailyBars: jest.fn(),
}));
await jest.unstable_mockModule('./alpaca-startup', () => ({ logAlpacaModeAtStartup: () => {} }));

// Alpaca docs: GET /v2/orders:by_client_order_id?client_order_id=<id> (query param). Path form 404s.
it('lookup uses Alpaca query form', async () => {
  const urls: string[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const u = String(input);
    urls.push(u);
    if (init?.method === 'POST') return new Response('x', { status: 503 });
    return new Response('nf', { status: 404 });
  }) as typeof fetch;
  process.env.ALPACA_API_KEY = 'k';
  process.env.ALPACA_SECRET_KEY = 's';
  process.env.ALPACA_PAPER = 'true';
  try {
    const { alpaca } = await import('./alpaca');
    await alpaca
      .placeOrder({
        symbol: 'QQQ',
        qty: 1,
        side: 'buy',
        type: 'market',
        time_in_force: 'day',
        client_order_id: 'cid-1',
      } as never)
      .catch(() => {});
  } finally {
    globalThis.fetch = orig;
  }
  const lookups = urls.filter((u) => u.includes('by_client_order_id'));
  expect(lookups[0]).toMatch(/orders:by_client_order_id\?client_order_id=cid-1$/);
});
