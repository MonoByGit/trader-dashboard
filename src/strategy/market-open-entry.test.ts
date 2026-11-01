import {
  bracketPricesFromEntry,
  breakoutChaseBlocked,
  midQuotePrice,
} from './market-open-entry';

describe('market-open entry pricing', () => {
  it('blocks when quote chases more than breakout_chase_limit_pct above last close', () => {
    const reason = breakoutChaseBlocked(100, 104, 0.03);
    expect(reason).toMatch(/Chase/);
    expect(breakoutChaseBlocked(100, 102.5, 0.03)).toBeNull();
  });

  it('computes bracket levels from entry price not stale bar close', () => {
    const { stopPrice, takeProfitPrice } = bracketPricesFromEntry(110, 0.02, 0.05);
    expect(stopPrice).toBe(107.8);
    expect(takeProfitPrice).toBe(115.5);
  });

  it('uses mid of ask and bid for reference price', () => {
    expect(midQuotePrice({ ap: 101, bp: 99 })).toBe(100);
    expect(midQuotePrice(undefined)).toBeNull();
  });
});
