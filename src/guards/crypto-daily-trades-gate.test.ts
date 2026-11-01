import { loadGuardConfig } from './config.js';
import { nextDailyTradeCount } from './daily-trades.js';

describe('crypto-scan daily BUY budget', () => {
  it('blocks third crypto buy when maxDailyCryptoTrades is 2', () => {
    const cfg = loadGuardConfig({ MAX_DAILY_CRYPTO_TRADES: '2' } as NodeJS.ProcessEnv);
    expect(nextDailyTradeCount(2, cfg.maxDailyCryptoTrades).allowed).toBe(false);
    expect(nextDailyTradeCount(1, cfg.maxDailyCryptoTrades)).toEqual({ allowed: true, next: 2 });
  });
});
