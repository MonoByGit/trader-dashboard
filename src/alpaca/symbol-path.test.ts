import { alpacaPositionCloseUrl, alpacaPositionSymbol } from './symbol-path.js';

describe('alpacaPositionSymbol', () => {
  it('strips slash for crypto pairs', () => {
    expect(alpacaPositionSymbol('BTC/USD')).toBe('BTCUSD');
  });

  it('leaves compact crypto symbol unchanged', () => {
    expect(alpacaPositionSymbol('BTCUSD')).toBe('BTCUSD');
  });

  it('leaves equity tickers unchanged', () => {
    expect(alpacaPositionSymbol('QQQ')).toBe('QQQ');
    expect(alpacaPositionSymbol('BRK.B')).toBe('BRK.B');
  });
});

describe('alpacaPositionCloseUrl', () => {
  it('uses Alpaca position symbol without slash in path', () => {
    expect(alpacaPositionCloseUrl('https://paper-api.alpaca.markets', 'BTC/USD')).toBe(
      'https://paper-api.alpaca.markets/v2/positions/BTCUSD',
    );
    expect(alpacaPositionCloseUrl('https://paper-api.alpaca.markets', 'QQQ')).toBe(
      'https://paper-api.alpaca.markets/v2/positions/QQQ',
    );
    expect(alpacaPositionCloseUrl('https://paper-api.alpaca.markets', 'BRK.B')).toBe(
      'https://paper-api.alpaca.markets/v2/positions/BRK.B',
    );
  });
});
