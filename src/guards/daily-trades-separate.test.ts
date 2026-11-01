import { loadGuardConfig } from './config.js';
import { nextDailyTradeCount } from './daily-trades.js';
import { applySoftStartToGuardConfig } from './soft-start.js';

describe('separate ETF and crypto daily trade budgets', () => {
  it('crypto can exhaust its budget while ETF budget stays intact', () => {
    const cfg = loadGuardConfig({ MAX_DAILY_TRADES: '10', MAX_DAILY_CRYPTO_TRADES: '2' } as NodeJS.ProcessEnv);
    let etfCount = 0;
    let cryptoCount = 0;

    for (let i = 0; i < 2; i++) {
      const slot = nextDailyTradeCount(cryptoCount, cfg.maxDailyCryptoTrades);
      expect(slot.allowed).toBe(true);
      cryptoCount = slot.next;
    }
    expect(nextDailyTradeCount(cryptoCount, cfg.maxDailyCryptoTrades).allowed).toBe(false);
    expect(nextDailyTradeCount(etfCount, cfg.maxDailyTrades).allowed).toBe(true);

    const etfSlot = nextDailyTradeCount(etfCount, cfg.maxDailyTrades);
    expect(etfSlot).toEqual({ allowed: true, next: 1 });
  });

  it('ETF can exhaust its budget while crypto budget stays intact', () => {
    const cfg = applySoftStartToGuardConfig(
      loadGuardConfig({
        MAX_DAILY_TRADES: '2',
        MAX_DAILY_CRYPTO_TRADES: '2',
      } as NodeJS.ProcessEnv),
      true,
    );
    expect(cfg.maxDailyTrades).toBe(2);
    expect(cfg.maxDailyCryptoTrades).toBe(1);

    let etfCount = 0;
    let cryptoCount = 0;

    for (let i = 0; i < 2; i++) {
      const slot = nextDailyTradeCount(etfCount, cfg.maxDailyTrades);
      expect(slot.allowed).toBe(true);
      etfCount = slot.next;
    }
    expect(nextDailyTradeCount(etfCount, cfg.maxDailyTrades).allowed).toBe(false);
    expect(nextDailyTradeCount(cryptoCount, cfg.maxDailyCryptoTrades).allowed).toBe(true);
  });
});
