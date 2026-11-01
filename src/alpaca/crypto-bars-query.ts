/** Alpaca crypto bars: symbols must be set once; searchParams.set already URL-encodes. */
export function setCryptoBarsSymbols(url: URL, symbols: string[]): void {
  url.searchParams.set('symbols', symbols.join(','));
}

export function cryptoBarsSymbolsQueryString(symbols: string[]): string {
  const url = new URL('https://data.alpaca.markets/v1beta3/crypto/us/bars');
  setCryptoBarsSymbols(url, symbols);
  return url.searchParams.toString();
}
