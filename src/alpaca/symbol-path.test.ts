import { alpacaPositionCloseUrl, alpacaSymbolPathSegment } from './symbol-path.js';

describe('alpacaSymbolPathSegment', () => {
  it('encodes crypto slash as one path segment', () => {
    expect(alpacaSymbolPathSegment('BTC/USD')).toBe('BTC%2FUSD');
  });

  it('leaves plain equity symbols unchanged', () => {
    expect(alpacaSymbolPathSegment('AAPL')).toBe('AAPL');
  });
});

describe('alpacaPositionCloseUrl', () => {
  it('builds close-position path with encoded symbol', () => {
    expect(alpacaPositionCloseUrl('https://paper-api.alpaca.markets', 'BTC/USD')).toBe(
      'https://paper-api.alpaca.markets/v2/positions/BTC%2FUSD',
    );
  });
});
