const CRYPTO_BARS_BASE = 'https://data.alpaca.markets/v1beta3/crypto/us/bars';

/** Alpaca crypto bars: symbols must be set once; searchParams.set already URL-encodes. */
export function setCryptoBarsSymbols(url: URL, symbols: string[]): void {
  url.searchParams.set('symbols', symbols.join(','));
}

/** Same `symbols` query encoding as `web/lib/alpaca-bars` fetchCryptoBars. */
export function cryptoBarsSymbolsQueryString(symbols: string[]): string {
  const url = new URL(CRYPTO_BARS_BASE);
  setCryptoBarsSymbols(url, symbols);
  return url.searchParams.toString();
}
