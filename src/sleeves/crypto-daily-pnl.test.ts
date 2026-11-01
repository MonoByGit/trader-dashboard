import { cryptoDailyLossPctOfAccount, sumCryptoChangeTodayUsd } from './crypto-daily-pnl.js';

describe('crypto daily P&L for loss guard', () => {
  it('trips 4% daily loss on realistic exposure drop, not flat sleeve budget', () => {
    const pnl = sumCryptoChangeTodayUsd([{ change_today: '-5000' }]);
    const lossPct = cryptoDailyLossPctOfAccount(100_000, pnl);
    expect(lossPct).toBeGreaterThan(4);
  });

  it('does not trip when crypto is flat on the day', () => {
    const pnl = sumCryptoChangeTodayUsd([{ change_today: '0' }]);
    expect(cryptoDailyLossPctOfAccount(100_000, pnl)).toBe(0);
  });
});
