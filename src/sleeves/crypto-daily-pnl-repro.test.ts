import {
  computeCryptoDailyPnlUsd,
  CRYPTO_SELL_FEE_PCT,
  sumCryptoRealizedPlTodayUsd,
} from './crypto-daily-pnl.js';

const isC = (s: string) => s.includes('/') || s.endsWith('USD');

describe('B-3 crypto realized P&L repro', () => {
  it("change_today '-0.05' is ignored, intraday pl used", () => {
    expect(
      computeCryptoDailyPnlUsd({
        positions: [{ change_today: '-0.05', unrealized_intraday_pl: '-50' }],
        realizedPlUsdToday: 0,
      }),
    ).toBe(-50);
  });

  it('realized: buy today 100, sell today 90 qty 1 = -10 minus fee', () => {
    const r = sumCryptoRealizedPlTodayUsd(
      [
        {
          symbol: 'BTC/USD',
          side: 'buy',
          status: 'filled',
          filled_at: '2026-11-01T02:00:00Z',
          filled_avg_price: '100',
          filled_qty: '1',
        },
        {
          symbol: 'BTC/USD',
          side: 'sell',
          status: 'filled',
          filled_at: '2026-11-01T08:00:00Z',
          filled_avg_price: '90',
          filled_qty: '1',
        },
      ],
      { todayUtcYmd: '2026-11-01', isCryptoSymbol: isC },
    );
    expect(r).toBeCloseTo(-10 - 90 * CRYPTO_SELL_FEE_PCT, 5);
  });

  it('overnight: bought yesterday, day-start ref 110, stopped today at 105 -> today -50', () => {
    const r = sumCryptoRealizedPlTodayUsd(
      [
        {
          symbol: 'BTC/USD',
          side: 'buy',
          status: 'filled',
          filled_at: '2026-10-31T10:00:00Z',
          filled_avg_price: '100',
          filled_qty: '10',
        },
        {
          symbol: 'BTC/USD',
          side: 'sell',
          status: 'filled',
          filled_at: '2026-11-01T08:00:00Z',
          filled_avg_price: '105',
          filled_qty: '10',
        },
      ],
      {
        todayUtcYmd: '2026-11-01',
        isCryptoSymbol: isC,
        yesterdayCloseBySymbol: { 'BTC/USD': 110 },
      },
    );
    expect(r).toBeCloseTo(-50 - 105 * 10 * CRYPTO_SELL_FEE_PCT, 5);
  });

  it('sell without buy in order window and no day-start price -> 0', () => {
    const r = sumCryptoRealizedPlTodayUsd(
      [
        {
          symbol: 'BTC/USD',
          side: 'sell',
          status: 'filled',
          filled_at: '2026-11-01T08:00:00Z',
          filled_avg_price: '90',
          filled_qty: '10',
        },
      ],
      { todayUtcYmd: '2026-11-01', isCryptoSymbol: isC },
    );
    expect(r).toBe(0);
  });

  it('two buys today then full sell (FIFO intraday refs)', () => {
    const r = sumCryptoRealizedPlTodayUsd(
      [
        {
          symbol: 'ETH/USD',
          side: 'buy',
          status: 'filled',
          filled_at: '2026-11-01T01:00:00Z',
          filled_avg_price: '100',
          filled_qty: '1',
        },
        {
          symbol: 'ETH/USD',
          side: 'buy',
          status: 'filled',
          filled_at: '2026-11-01T03:00:00Z',
          filled_avg_price: '80',
          filled_qty: '1',
        },
        {
          symbol: 'ETH/USD',
          side: 'sell',
          status: 'filled',
          filled_at: '2026-11-01T05:00:00Z',
          filled_avg_price: '85',
          filled_qty: '2',
        },
      ],
      { todayUtcYmd: '2026-11-01', isCryptoSymbol: isC },
    );
    expect(r).toBeCloseTo(-10 - 85 * 2 * CRYPTO_SELL_FEE_PCT, 5);
  });
});
