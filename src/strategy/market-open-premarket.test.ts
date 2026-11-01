import { premarketApprovedBuySymbols } from './market-open-premarket.js';

const allPassCriteria = {
  trend_above_sma20: 'pass',
  momentum_rsi: 'pass',
  volume_above_avg: 'pass',
  vix_below_limit: 'pass',
  no_earnings_risk: 'pass',
  news_sentiment: 'pass',
};

describe('premarketApprovedBuySymbols', () => {
  it('only includes BUY rows where all six criteria pass', () => {
    const rows = [
      { symbol: 'QQQ', decision: 'BUY', criteria: allPassCriteria },
      { symbol: 'XLK', decision: 'BUY', criteria: { ...allPassCriteria, momentum_rsi: 'fail' } },
      { symbol: 'SPY', decision: 'NO_GO', criteria: allPassCriteria },
    ];
    const approved = premarketApprovedBuySymbols(rows, {
      newsUsable: true,
      rsiMin: 50,
      rsiMax: 75,
    });
    expect(approved).toEqual(['QQQ']);
  });

  it('rejects BUY when news criteria were unknown at premarket', () => {
    const rows = [{ symbol: 'QQQ', decision: 'BUY', criteria: { ...allPassCriteria, news_sentiment: 'unknown' } }];
    const approved = premarketApprovedBuySymbols(rows, {
      newsUsable: false,
      rsiMin: 50,
      rsiMax: 75,
    });
    expect(approved).toEqual([]);
  });
});
