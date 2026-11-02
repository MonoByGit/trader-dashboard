import { momentumMarketTimeInForce } from './broker';

describe('momentumMarketTimeInForce', () => {
  it('gebruikt gtc voor crypto, day voor ETF', () => {
    expect(momentumMarketTimeInForce('BTC/USD')).toBe('gtc');
    expect(momentumMarketTimeInForce('QQQ')).toBe('day');
  });
});
