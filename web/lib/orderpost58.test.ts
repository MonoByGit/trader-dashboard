/** @jest-environment node */
import { jest } from '@jest/globals';

type Beh = { post: 'timeout' | '503' | '422dup'; lookup: 'found' | '404' | 'timeout' };

async function run(b: Beh) {
  jest.resetModules();
  await jest.unstable_mockModule('./alpaca-bars', () => ({
    DEFAULT_DAILY_BAR_LOOKBACK_DAYS: 40,
    fetchCryptoBars: jest.fn(),
    fetchStockDailyBars: jest.fn(),
  }));
  await jest.unstable_mockModule('./alpaca-startup', () => ({ logAlpacaModeAtStartup: () => {} }));

  const calls: string[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('by_client_order_id')) {
      calls.push('LOOKUP');
      if (b.lookup === 'timeout') {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      }
      if (b.lookup === '404') return new Response('nf', { status: 404 });
      return new Response(JSON.stringify({ id: 'ord-1', client_order_id: 'x' }), { status: 200 });
    }
    if (init?.method === 'POST') {
      calls.push('POST');
      if (b.post === 'timeout') {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      }
      if (b.post === '503') return new Response('x', { status: 503 });
      return new Response('{"code":40010001,"message":"client_order_id must be unique"}', {
        status: 422,
      });
    }
    return new Response('nf', { status: 404 });
  }) as typeof fetch;
  process.env.ALPACA_API_KEY = 'k';
  process.env.ALPACA_SECRET_KEY = 's';
  process.env.ALPACA_PAPER = 'true';
  try {
    const { alpaca } = await import('./alpaca');
    try {
      const o = await alpaca.placeOrder({
        symbol: 'QQQ',
        qty: 1,
        side: 'buy',
        type: 'market',
        time_in_force: 'day',
        client_order_id: 'cid-1',
      } as never);
      return { ok: o.id, calls };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { err: msg.slice(0, 60), calls };
    }
  } finally {
    globalThis.fetch = orig;
  }
}

describe('order POST recovery (B1 query lookup)', () => {
  it('timeout -> lookup found', async () => {
    const r = await run({ post: 'timeout', lookup: 'found' });
    expect(r.ok).toBe('ord-1');
    expect(r.calls.filter((c) => c === 'POST')).toHaveLength(1);
  });

  it('timeout -> lookup times out: throws, never a 2nd POST', async () => {
    const r = await run({ post: 'timeout', lookup: 'timeout' });
    expect(r.err).toBeDefined();
    expect(r.calls.filter((c) => c === 'POST')).toHaveLength(1);
  });

  it('timeout -> lookup 404: throws, one POST', async () => {
    const r = await run({ post: 'timeout', lookup: '404' });
    expect(r.err).toBeDefined();
    expect(r.calls.filter((c) => c === 'POST')).toHaveLength(1);
  });

  it('503 -> lookup 404: throws, one POST', async () => {
    const r = await run({ post: '503', lookup: '404' });
    expect(r.calls.filter((c) => c === 'POST')).toHaveLength(1);
  });

  it('422 duplicate client_order_id: is it resolved via lookup?', async () => {
    const r = await run({ post: '422dup', lookup: 'found' });
    expect(r.calls.filter((c) => c === 'POST')).toHaveLength(1);
  });
});
