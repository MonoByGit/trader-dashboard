import {
  bracketPricesFromEntry,
  breakoutChaseBlocked,
  entryPriceFromQuote,
  midQuotePrice,
} from './market-open-entry';

describe('market-open entry pricing', () => {
  it('blocks when quote chases more than breakout_chase_limit_pct above last close', () => {
    const reason = breakoutChaseBlocked(100, 104, 0.03);
    expect(reason).toMatch(/Chase/);
    expect(breakoutChaseBlocked(100, 102.5, 0.03)).toBeNull();
  });

  it('does not false-block when reference is prior close and entry is live quote above partial bar', () => {
    const priorClose = 100;
    const liveQuote = 101;
    const partialBarClose = 101;
    expect(breakoutChaseBlocked(partialBarClose, liveQuote, 0.03)).toBeNull();
    expect(breakoutChaseBlocked(priorClose, liveQuote, 0.03)).toBeNull();
    expect(breakoutChaseBlocked(priorClose, 104, 0.03)).toMatch(/Chase/);
  });

  it('computes bracket levels from entry price not stale bar close', () => {
    const { stopPrice, takeProfitPrice } = bracketPricesFromEntry(110, 0.02, 0.05);
    expect(stopPrice).toBe(107.8);
    expect(takeProfitPrice).toBe(115.5);
  });

  it('uses mid of ask and bid when spread is tight', () => {
    expect(midQuotePrice({ ap: 101, bp: 99 })).toBe(100);
    expect(midQuotePrice(undefined)).toBeNull();
  });

  it('falls back to ask when spread is wider than 0.5%', () => {
    const r = entryPriceFromQuote({ ap: 102, bp: 100 }, 0.005);
    expect(r).toEqual({ price: 102, source: 'ask_wide_spread' });
  });
});
