import { inferRulesPatch } from './lesson-patch';

describe('inferRulesPatch', () => {
  it('lowers rsi cap when proposal mentions stricter RSI', () => {
    const patch = inferRulesPatch('Strengere RSI', 'Max RSI naar 70 voor minder late entries');
    expect(patch.rsi_max).toBe(70);
  });

  it('defaults to modest rsi tweak', () => {
    const patch = inferRulesPatch('Algemene les', 'Wees voorzichtiger na verliezen');
    expect(patch.rsi_max).toBe(72);
  });
});
