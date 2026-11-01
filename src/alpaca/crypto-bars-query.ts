export const CRYPTO_BARS_BASE = 'https://data.alpaca.markets/v1beta3/crypto/us/bars';

/** Alpaca crypto bars: symbols must be set once; searchParams.set already URL-encodes. */
export function setCryptoBarsSymbols(url: URL, symbols: string[]): void {
  url.searchParams.set('symbols', symbols.join(','));
}

/** Same `symbols` query encoding as fetchCryptoBars (web/lib/alpaca-bars re-exports that fetch). */
export function cryptoBarsSymbolsQueryString(symbols: string[]): string {
  const url = new URL(CRYPTO_BARS_BASE);
  setCryptoBarsSymbols(url, symbols);
  return url.searchParams.toString();
}

export function buildCryptoBarsListUrl(opts: {
  symbols: string[];
  start: string;
  end: string;
  timeframe?: string;
}): URL {
  const url = new URL(CRYPTO_BARS_BASE);
  setCryptoBarsSymbols(url, opts.symbols);
  url.searchParams.set('timeframe', opts.timeframe ?? '1Day');
  url.searchParams.set('start', opts.start);
  url.searchParams.set('end', opts.end);
  url.searchParams.set('limit', '10000');
  return url;
}
