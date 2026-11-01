import { computeSleeveAccounting } from './accounting';

describe('computeSleeveAccounting', () => {
  it('splits ETF and crypto exposure with crypto cash headroom', () => {
    const r = computeSleeveAccounting({
      totalEquityUsd: 100_000,
      totalCashUsd: 40_000,
      cryptoBudgetPct: 20,
      cryptoModuleEnabled: true,
      positions: [
        { symbol: 'QQQ', market_value: '30000', unrealized_pl: '100' },
        { symbol: 'BTC/USD', market_value: '15000', unrealized_pl: '-200' },
      ],
    });
    expect(r.etf.exposureUsd).toBe(30000);
    expect(r.crypto.exposureUsd).toBe(15000);
    expect(r.combinedEquityUsd).toBe(100_000);
    expect(r.crypto.equityUsd).toBeGreaterThan(15000);
    expect(r.etf.equityUsd + r.crypto.equityUsd).toBeLessThanOrEqual(100_000 + 1);
  });
});
