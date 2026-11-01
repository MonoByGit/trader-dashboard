import { nextConsecutiveLosses } from './consecutive-losses.js';

describe('nextConsecutiveLosses', () => {
  it('increments on loss and resets on win', () => {
    expect(nextConsecutiveLosses(2, -10)).toBe(3);
    expect(nextConsecutiveLosses(3, 5)).toBe(0);
    expect(nextConsecutiveLosses(1, 0)).toBe(1);
  });
});
