import {
  cryptoStopLookupKeys,
  cryptoStopStorageKey,
  legacyCryptoStopStorageKeys,
} from './stop-storage-key.js';

describe('cryptoStopStorageKey', () => {
  it('uses compact Alpaca form for slash pairs', () => {
    expect(cryptoStopStorageKey('BTC/USD')).toBe('crypto_stop:BTCUSD');
    expect(cryptoStopStorageKey('BTCUSD')).toBe('crypto_stop:BTCUSD');
  });

  it('lists legacy slash key for compact lookup', () => {
    expect(legacyCryptoStopStorageKeys('BTCUSD')).toContain('crypto_stop:BTC/USD');
    expect(cryptoStopLookupKeys('BTCUSD')[0]).toBe('crypto_stop:BTCUSD');
    expect(cryptoStopLookupKeys('BTCUSD')).toContain('crypto_stop:BTC/USD');
  });
});
