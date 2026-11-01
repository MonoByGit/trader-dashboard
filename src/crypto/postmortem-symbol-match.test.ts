import { alpacaSymbolsEqual } from '../alpaca/symbol-path.js';

/** M-K: reporting must match BTC/USD decisions to BTCUSD post-mortems. */
describe('postmortem/report symbol normalization (M-K)', () => {
  it('matches slash watchlist symbol to compact post-mortem symbol', () => {
    const postMortems = [{ symbol: 'BTCUSD' }];
    const buy = { symbol: 'BTC/USD' };
    expect(postMortems.some((p) => alpacaSymbolsEqual(p.symbol, buy.symbol))).toBe(true);
  });

  it('matches compact buy history to slash post-mortem symbol', () => {
    const postMortems = [{ symbol: 'BTC/USD' }];
    const buy = { symbol: 'BTCUSD' };
    expect(postMortems.some((p) => alpacaSymbolsEqual(p.symbol, buy.symbol))).toBe(true);
  });
});
