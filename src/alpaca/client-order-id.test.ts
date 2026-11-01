<<<<<<< HEAD
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
=======
import { buildEtfClientOrderId } from './client-order-id.js';

describe('buildEtfClientOrderId', () => {
  it('stays within 48 chars and sanitises symbol', () => {
    const id = buildEtfClientOrderId({
      routine: 'market-open',
      runId: 'run-market-open-1730462400000',
      symbol: 'QQQ',
      side: 'buy',
    });
    expect(id.length).toBeLessThanOrEqual(48);
    expect(id).toMatch(/buy$/);
  });

  it('is stable for the same inputs (retries reuse id)', () => {
    const input = {
      routine: 'eod',
      runId: 'run-eod-123',
      symbol: 'SPY',
      side: 'sell' as const,
      tag: 'restop',
    };
    expect(buildEtfClientOrderId(input)).toBe(buildEtfClientOrderId(input));
>>>>>>> 8f2f496 (feat(etf): idempotent Alpaca order POSTs with client_order_id)
  });
});
