/**
 * Alpaca path segments for symbol_or_asset_id must be URL-encoded
 * (e.g. BTC/USD → BTC%2FUSD). See Alpaca assets/positions API reference.
 */
export function alpacaSymbolPathSegment(symbol: string): string {
  return encodeURIComponent(symbol);
}

export function alpacaPositionCloseUrl(baseUrl: string, symbol: string): string {
  const base = baseUrl.replace(/\/$/, '');
  return `${base}/v2/positions/${alpacaSymbolPathSegment(symbol)}`;
}
