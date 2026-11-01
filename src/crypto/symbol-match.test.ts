import { loadCryptoGuardConfig } from '../guards/crypto-config.js';
import { evaluateCryptoLimits } from '../guards/crypto-limits.js';
import {
  cryptoSymbolExposureUsd,
  hasCryptoPosition,
  openOrderMatchesSymbol,
} from './symbol-match.js';

describe('crypto symbol matching (position BTCUSD vs candidate BTC/USD)', () => {
  const positions = [{ symbol: 'BTCUSD', market_value: '5000' }];

  it('sums exposure for compact position vs slash candidate', () => {
    expect(cryptoSymbolExposureUsd(positions, 'BTC/USD')).toBe(5000);
    expect(cryptoSymbolExposureUsd(positions, 'BTCUSD')).toBe(5000);
  });

  it('detects open position across symbol forms', () => {
    expect(hasCryptoPosition(positions, 'BTC/USD')).toBe(true);
    expect(hasCryptoPosition(positions, 'ETH/USD')).toBe(false);
  });

  it('blocks additional buy when 5% per-coin limit already reached', () => {
    const cfg = loadCryptoGuardConfig({});
    const equity = 100_000;
    const exposure = cryptoSymbolExposureUsd(positions, 'BTC/USD');
    expect(exposure / equity).toBe(0.05);

    const r = evaluateCryptoLimits(
      {
        totalEquityUsd: equity,
        cryptoExposureUsd: exposure,
        symbolExposureUsd: exposure,
        proposedOrderUsd: 1_000,
        newPositionsOpenedToday: 0,
        cryptoDayStartEquityUsd: exposure,
        cryptoSleeveEquityUsd: exposure,
      },
      cfg,
    );
    expect(r.allowed).toBe(false);
    expect(r.failReasons.some((x) => x.includes('position'))).toBe(true);
  });

  it('matches open stop orders across symbol forms', () => {
    const open = [{ symbol: 'BTCUSD', side: 'sell', type: 'stop_limit' as const }];
    expect(
      open.some(
        (o) =>
          openOrderMatchesSymbol(o, 'BTC/USD') &&
          o.side === 'sell' &&
          (o.type === 'stop_limit' || o.type === 'stop'),
      ),
    ).toBe(true);
    expect(openOrderMatchesSymbol({ symbol: 'ETHUSD' }, 'BTC/USD')).toBe(false);
  });
});
