import { buildAlpacaClientOrderId } from './client-order-id.js';

describe('buildAlpacaClientOrderId', () => {
  it('sanitises symbols and caps length at 48', () => {
    const id = buildAlpacaClientOrderId({
      routine: 'crypto-scan',
      runId: '1234567890',
      symbol: 'BTC/USD',
      side: 'buy',
    });
    expect(id).toMatch(/^crypto-scan-1234567890-BTC-USD-buy$/);
    expect(id.length).toBeLessThanOrEqual(48);
  });
});
