import { evaluateEntryRules } from './entry-rules';
import type { SymbolSnapshot } from './indicators';

const snap: SymbolSnapshot = {
  symbol: 'QQQ',
  lastClose: 100,
  sma20: 99,
  aboveSma20: true,
  rsi: 60,
  volumeRatio: 1.2,
};

const rules = {
  max_positions: 3,
  hold_overnight: false,
  hard_stop_pct: 0.02,
  take_profit_pct: 0.05,
  rsi_min: 50,
  rsi_max: 75,
  volume_ratio_min: 1.1,
  vix_threshold: 30,
  vol_stress_ratio_max: 1.15,
};

describe('evaluateEntryRules vol proxy', () => {
  it('uses VIXY stress ratio, not raw ETF price vs 30', () => {
    const calm = evaluateEntryRules(snap, rules, { vixStressRatio: 1.05 });
    expect(calm.criteria.vix_below_limit).toBe('pass');

    const stressed = evaluateEntryRules(snap, rules, { vixStressRatio: 1.25 });
    expect(stressed.criteria.vix_below_limit).toBe('fail');

    const rawVixyPrice = evaluateEntryRules(snap, rules, { vixStressRatio: 28 });
    expect(rawVixyPrice.criteria.vix_below_limit).toBe('fail');
  });
});
