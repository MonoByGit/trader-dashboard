import { mergeStrategyRules, strategyContentFingerprint, type StrategyContent } from './content';

const base: StrategyContent = {
  name: 'Test',
  version: '1.0',
  symbols: ['SPY', 'QQQ'],
  rules: {
    max_positions: 3,
    hold_overnight: false,
    hard_stop_pct: 0.02,
    take_profit_pct: 0.05,
    rsi_min: 50,
    rsi_max: 75,
    volume_ratio_min: 1.1,
    vix_threshold: 30,
    position_size_pct: 0.25,
  },
};

describe('strategy content', () => {
  it('merges rule patches into a draft copy', () => {
    const draft = mergeStrategyRules(base, { rsi_max: 70 }, '1.1-draft');
    expect(draft.version).toBe('1.1-draft');
    expect(draft.rules.rsi_max).toBe(70);
    expect(draft.rules.rsi_min).toBe(50);
  });

  it('fingerprint changes when rules change', () => {
    const a = strategyContentFingerprint(base);
    const b = strategyContentFingerprint(mergeStrategyRules(base, { vix_threshold: 25 }));
    expect(a).not.toBe(b);
  });
});
