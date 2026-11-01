import { clampWeightToGuardCap } from './guard-cap.js';

describe('clampWeightToGuardCap', () => {
  it('allows soft-start 5% cap to bind below 25% base cap', () => {
    expect(clampWeightToGuardCap(0.25, 5)).toBe(0.05);
  });

  it('leaves weight unchanged when guard cap is higher', () => {
    expect(clampWeightToGuardCap(0.12, 30)).toBe(0.12);
  });
});
