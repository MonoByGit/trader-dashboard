import { jest } from '@jest/globals';
import { cryptoBarsSymbolsQueryString } from './crypto-bars-query.js';
import { fetchCryptoBars } from './fetch-crypto-bars.js';

describe('crypto bars symbols query (shared with web/lib/alpaca-bars)', () => {
  it('encodes BTC/USD once (not %252F)', () => {
    const qs = cryptoBarsSymbolsQueryString(['BTC/USD']);
    expect(qs).toContain('symbols=BTC%2FUSD');
    expect(qs).not.toContain('%252F');
  });

  it('joins multiple symbols with comma', () => {
    const qs = cryptoBarsSymbolsQueryString(['BTC/USD', 'ETH/USD']);
    expect(qs).toMatch(/symbols=BTC%2FUSD%2CETH%2FUSD/);
  });

  it('fetchCryptoBars requests symbols query once (mocked fetch)', async () => {
    const originalFetch = global.fetch;
    const capturedUrls: string[] = [];
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      capturedUrls.push(String(input));
      return {
        ok: true,
        json: async () => ({ bars: { 'BTC/USD': [] } }),
      } as Response;
    });

    const prevKey = process.env.ALPACA_API_KEY;
    const prevSecret = process.env.ALPACA_SECRET_KEY;
    process.env.ALPACA_API_KEY = 'test-key';
    process.env.ALPACA_SECRET_KEY = 'test-secret';

    try {
      await fetchCryptoBars({
        symbols: ['BTC/USD'],
        start: '2024-01-01',
        end: '2024-01-02',
      });
    } finally {
      global.fetch = originalFetch;
      if (prevKey === undefined) delete process.env.ALPACA_API_KEY;
      else process.env.ALPACA_API_KEY = prevKey;
      if (prevSecret === undefined) delete process.env.ALPACA_SECRET_KEY;
      else process.env.ALPACA_SECRET_KEY = prevSecret;
    }

    expect(capturedUrls.length).toBeGreaterThan(0);
    expect(capturedUrls[0]).toContain('symbols=BTC%2FUSD');
    expect(capturedUrls[0]).not.toContain('%252F');
  });
});
