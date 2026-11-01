import {
  applyPremarketDecisionRules,
  allPremarketCriteriaPass,
  buildFullPremarketCriteria,
  momentumRsiPasses,
  momentumRsiRuleText,
  newsContextPrompt,
  newsIsUsable,
  normalizeCriterionValue,
  PREMARKET_ENTRY_CRITERIA,
} from './premarket-decisions.js';

describe('premarket news + criteria rules', () => {
  it('describes inclusive RSI band in prompt text', () => {
    expect(momentumRsiRuleText(50, 75)).toContain('72.9');
    expect(momentumRsiRuleText(50, 75)).toContain('75.0 → pass');
  });

  it('treats 72.9 as pass for RSI 50-75', () => {
    expect(momentumRsiPasses(72.9, 50, 75)).toBe(true);
    expect(momentumRsiPasses(75, 50, 75)).toBe(true);
    expect(momentumRsiPasses(75.01, 50, 75)).toBe(false);
  });

  it('marks news unusable when lookup failed or empty', () => {
    expect(newsIsUsable('ok')).toBe(true);
    expect(newsIsUsable('failed')).toBe(false);
    expect(newsContextPrompt('failed')).toMatch(/unknown/i);
  });

  it('forces unknown news criteria when lookup failed', () => {
    const out = applyPremarketDecisionRules(
      {
        symbol: 'QQQ',
        decision: 'BUY',
        criteria: { no_earnings_risk: 'pass', news_sentiment: 'pass', momentum_rsi: 'pass' },
      },
      { newsUsable: false, softStartEnabled: true, rsi: 72.9, rsiMin: 50, rsiMax: 75 },
    );
    expect(out.criteria.no_earnings_risk).toBe('unknown');
    expect(out.criteria.news_sentiment).toBe('unknown');
    expect(out.decision).toBe('NO_GO');
  });

  it('overrides wrong LLM RSI with snapshot RSI 72.9 → pass', () => {
    const out = applyPremarketDecisionRules(
      {
        symbol: 'QQQ',
        decision: 'HOLD',
        criteria: { momentum_rsi: 'fail' },
      },
      { newsUsable: true, softStartEnabled: false, rsi: 72.9, rsiMin: 50, rsiMax: 75 },
    );
    expect(out.criteria.momentum_rsi).toBe('pass');
  });

  it('normalizes uppercase PASS and booleans', () => {
    expect(normalizeCriterionValue('PASS')).toBe('pass');
    expect(normalizeCriterionValue(true)).toBe('pass');
    expect(normalizeCriterionValue(false)).toBe('fail');
    expect(normalizeCriterionValue('n/a')).toBe('unknown');
  });

  it('fills missing criteria keys as unknown', () => {
    const full = buildFullPremarketCriteria(
      { trend_above_sma20: 'pass' },
      { newsUsable: true, rsiMin: 50, rsiMax: 75 },
    );
    expect(PREMARKET_ENTRY_CRITERIA.every((k) => full[k] != null)).toBe(true);
    expect(full.volume_above_avg).toBe('unknown');
  });

  it('blocks soft-start BUY when LLM sends PASS uppercase but keys missing', () => {
    const out = applyPremarketDecisionRules(
      {
        symbol: 'QQQ',
        decision: 'BUY',
        criteria: {
          trend_above_sma20: 'PASS',
          momentum_rsi: true,
          volume_above_avg: 'pass',
          vix_below_limit: 'pass',
        },
      },
      { newsUsable: true, softStartEnabled: true, rsi: 72.9, rsiMin: 50, rsiMax: 75 },
    );
    expect(allPremarketCriteriaPass(out.criteria)).toBe(false);
    expect(out.decision).toBe('NO_GO');
  });

  it('allows BUY under soft-start when news ok and all pass', () => {
    const out = applyPremarketDecisionRules(
      {
        symbol: 'QQQ',
        decision: 'BUY',
        criteria: {
          trend_above_sma20: 'pass',
          momentum_rsi: 'pass',
          volume_above_avg: 'pass',
          vix_below_limit: 'pass',
          no_earnings_risk: 'pass',
          news_sentiment: 'pass',
        },
      },
      { newsUsable: true, softStartEnabled: true, rsi: 72.9, rsiMin: 50, rsiMax: 75 },
    );
    expect(out.decision).toBe('BUY');
  });
});
