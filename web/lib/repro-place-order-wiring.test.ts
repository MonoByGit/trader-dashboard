// Wiring test: real web/lib/alpaca.ts placeOrder with mocked fetch.
import { jest } from '@jest/globals';

await jest.unstable_mockModule('./alpaca-bars', () => ({
  DEFAULT_DAILY_BAR_LOOKBACK_DAYS: 40,
  fetchCryptoBars: jest.fn(),
  fetchStockDailyBars: jest.fn(),
}));
await jest.unstable_mockModule('./alpaca-startup', () => ({ logAlpacaModeAtStartup: () => {} }));

process.env.ALPACA_API_KEY = 'k';
process.env.ALPACA_SECRET_KEY = 's';
process.env.ALPACA_TRADING_BASE_URL = 'https://paper-api.alpaca.markets';

const { alpaca } = await import('./alpaca');

const timeout = () => new DOMException('The operation was aborted due to timeout', 'TimeoutError');
const order = {
  id: 'ord-1',
  client_order_id: 'cid-1',
  symbol: 'BTC/USD',
  side: 'buy',
  qty: '0.01',
  filled_qty: '0',
  type: 'market',
  status: 'new',
};
const req = {
  symbol: 'BTC/USD',
  qty: 0.01,
  side: 'buy' as const,
  type: 'market' as const,
  time_in_force: 'gtc' as const,
  client_order_id: 'cid-1',
};

function harness(
  getBehaviour: () => Promise<Response>,
  postBehaviour: () => Promise<Response> = async () => {
    throw timeout();
  },
) {
  const calls: string[] = [];
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const m = init?.method ?? 'GET';
    calls.push(`${m} ${String(url)}`);
    if (m === 'POST') return postBehaviour();
    return getBehaviour();
  });
  return calls;
}

afterEach(() => jest.restoreAllMocks());

it('POST timeout + lookup found -> returns order, 1 POST', async () => {
  const calls = harness(async () => new Response(JSON.stringify(order), { status: 200 }));
  await expect(alpaca.placeOrder(req as never)).resolves.toMatchObject({ id: 'ord-1' });
  expect(calls.filter((c) => c.startsWith('POST'))).toHaveLength(1);
  expect(calls[1]).toBe(
    'GET https://paper-api.alpaca.markets/v2/orders:by_client_order_id?client_order_id=cid-1',
  );
});

it('POST timeout + lookup 404 -> rejects, no second POST', async () => {
  const calls = harness(async () => new Response('{"message":"not found"}', { status: 404 }));
  await expect(alpaca.placeOrder(req as never)).rejects.toThrow(/timeout/i);
  expect(calls.filter((c) => c.startsWith('POST'))).toHaveLength(1);
});

it('POST timeout + lookup timeout -> rejects, no second POST', async () => {
  const calls = harness(async () => {
    throw timeout();
  });
  await expect(alpaca.placeOrder(req as never)).rejects.toThrow();
  expect(calls.filter((c) => c.startsWith('POST'))).toHaveLength(1);
});

it('POST 503 + lookup found -> returns order', async () => {
  harness(
    async () => new Response(JSON.stringify(order), { status: 200 }),
    async () => new Response('busy', { status: 503 }),
  );
  await expect(alpaca.placeOrder(req as never)).resolves.toMatchObject({ id: 'ord-1' });
});

it('POST 422 duplicate client_order_id -> rejects, no lookup', async () => {
  const calls = harness(
    async () => new Response(JSON.stringify(order), { status: 200 }),
    async () => new Response('{"message":"client_order_id must be unique"}', { status: 422 }),
  );
  await expect(alpaca.placeOrder(req as never)).rejects.toMatchObject({ status: 422 });
  expect(calls).toHaveLength(1);
});
