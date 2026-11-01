import { nextDailyTradeCount } from './daily-trades.js';

describe('nextDailyTradeCount', () => {
  it('blocks third buy when max is 2', () => {
    expect(nextDailyTradeCount(2, 2).allowed).toBe(false);
    expect(nextDailyTradeCount(1, 2)).toEqual({ allowed: true, next: 2 });
  });
});
