import { classifySymbol, isCryptoSymbol } from './classify.js';

describe('classifySymbol', () => {
  it('treats compact Alpaca crypto symbols as crypto', () => {
    expect(classifySymbol('BTCUSD')).toBe('crypto');
    expect(isCryptoSymbol('BTCUSD')).toBe(true);
  });

  it('keeps slash pairs as crypto', () => {
    expect(classifySymbol('BTC/USD')).toBe('crypto');
  });

  it('treats ETFs as etf', () => {
    expect(classifySymbol('QQQ')).toBe('etf');
    expect(classifySymbol('SPY', 'us_equity')).toBe('etf');
  });

  it('uses asset_class hint when present', () => {
    expect(classifySymbol('BTCUSD', 'crypto')).toBe('crypto');
  });

  it('prefers us_equity hint over compact USD suffix', () => {
    expect(classifySymbol('FOOUSD', 'us_equity')).toBe('etf');
  });
});

