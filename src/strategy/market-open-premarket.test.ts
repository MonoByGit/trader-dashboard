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

import {
  MARKET_OPEN_NO_APPROVAL_SKIP_REASON,
  marketOpenCandidateUniverse,
  marketOpenEmptyUniverseReason,
  marketOpenPremarketPromptLine,
} from './market-open-premarket.js';

describe('marketOpenCandidateUniverse (casus 2-11: XLF goedgekeurd, AI stelde XLV en XLE voor)', () => {
  it('geeft de AI alleen de premarket-goedgekeurde symbolen', () => {
    const universe = marketOpenCandidateUniverse(['XLF'], []);
    expect(universe).toEqual(['XLF']);
    expect(marketOpenPremarketPromptLine(universe)).toContain('XLF');
    expect(marketOpenPremarketPromptLine(universe)).not.toContain('XLV');
  });

  it('laat al open symbolen weg', () => {
    expect(marketOpenCandidateUniverse(['XLF', 'QQQ'], ['QQQ'])).toEqual(['XLF']);
  });

  it('is leeg zonder goedkeuring, dan hoeft de AI niet te draaien', () => {
    expect(marketOpenCandidateUniverse([], ['SPY'])).toEqual([]);
  });

  it('geeft een eerlijke skip-reden: niets goedgekeurd of alles al open', () => {
    expect(marketOpenEmptyUniverseReason([])).toBe(MARKET_OPEN_NO_APPROVAL_SKIP_REASON);
    expect(marketOpenEmptyUniverseReason(['XLF'])).toBe('Alle premarket-goedkeuringen (XLF) staan al open');
  });
});
