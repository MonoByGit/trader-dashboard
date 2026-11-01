import { evaluateCryptoLimits } from '../guards/crypto-limits.js';
import { loadCryptoGuardConfig } from '../guards/crypto-config.js';
import {
  changeTodayIsFractionNotUsd,
  computeCryptoDailyPnlUsd,
  CRYPTO_SELL_FEE_PCT,
  cryptoDailyLossPctOfAccount,
  sumCryptoRealizedPlTodayUsd,
} from './crypto-daily-pnl.js';

describe('crypto daily P&L for loss guard', () => {
  it('treats change_today as fraction, not dollars', () => {
    expect(changeTodayIsFractionNotUsd('-0.05')).toBe(true);
    const pnl = computeCryptoDailyPnlUsd({
      positions: [{ change_today: '-0.05', unrealized_intraday_pl: '-5000' }],
      realizedPlUsdToday: 0,
    });
    expect(pnl).toBe(-5000);
    expect(cryptoDailyLossPctOfAccount(100_000, pnl)).toBeGreaterThan(4);
  });

  it('combines unrealized_intraday_pl with realized sells today', () => {
    const realized = sumCryptoRealizedPlTodayUsd(
      [
        {
          symbol: 'BTC/USD',
          side: 'buy',
          status: 'filled',
          filled_at: '2026-11-01T08:00:00Z',
          filled_avg_price: '100000',
          filled_qty: '0.1',
        },
        {
          symbol: 'BTC/USD',
          side: 'sell',
          status: 'filled',
          filled_at: '2026-11-01T10:00:00Z',
          filled_avg_price: '95000',
          filled_qty: '0.1',
        },
      ],
      { todayUtcYmd: '2026-11-01', isCryptoSymbol: (s) => s.includes('BTC') },
    );
    expect(realized).toBeCloseTo(-500 - 95000 * 0.1 * CRYPTO_SELL_FEE_PCT, 4);
    const pnl = computeCryptoDailyPnlUsd({
      positions: [{ unrealized_intraday_pl: '-4500' }],
      realizedPlUsdToday: realized,
    });
    const cfg = loadCryptoGuardConfig({});
    const r = evaluateCryptoLimits(
      {
        totalEquityUsd: 100_000,
        cryptoExposureUsd: 15_000,
        symbolExposureUsd: 0,
        proposedOrderUsd: 0,
        newPositionsOpenedToday: 0,
        cryptoDayStartEquityUsd: 20_000,
        cryptoSleeveEquityUsd: 20_000,
        cryptoDailyPnlUsd: pnl,
      },
      cfg,
    );
    expect(r.allowed).toBe(false);
  });
});
