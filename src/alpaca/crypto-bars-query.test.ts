import { cryptoBarsSymbolsQueryString } from './crypto-bars-query.js';

describe('crypto bars symbols query', () => {
  it('encodes BTC/USD once (not %252F)', () => {
    const qs = cryptoBarsSymbolsQueryString(['BTC/USD']);
    expect(qs).toContain('symbols=BTC%2FUSD');
    expect(qs).not.toContain('%252F');
  });

  it('joins multiple symbols with comma', () => {
    const qs = cryptoBarsSymbolsQueryString(['BTC/USD', 'ETH/USD']);
    expect(qs).toMatch(/symbols=BTC%2FUSD%2CETH%2FUSD/);
  });
});
