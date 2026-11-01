import { buildAlpacaClientOrderId, buildEtfClientOrderId } from './client-order-id.js';

describe('buildAlpacaClientOrderId', () => {
  it('sanitises crypto symbols and caps length at 48', () => {
    const id = buildAlpacaClientOrderId({
      routine: 'crypto-scan',
      runId: '1234567890',
      symbol: 'BTC/USD',
      side: 'buy',
    });
    expect(id.length).toBeLessThanOrEqual(48);
    expect(id).toMatch(/buy$/);
    expect(id).toMatch(/BTC-USD/);
  });

  it('stays within 48 chars for ETF market-open ids', () => {
    const id = buildAlpacaClientOrderId({
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
    expect(buildAlpacaClientOrderId(input)).toBe(buildAlpacaClientOrderId(input));
    expect(buildEtfClientOrderId(input)).toBe(buildAlpacaClientOrderId(input));
  });
});
