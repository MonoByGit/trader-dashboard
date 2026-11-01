/**
 * Alpaca open positions use crypto symbols without a slash (BTCUSD for pair BTC/USD).
 * URL-encoding the slash is not reliable — many stacks decode %2F back to /.
 * Equities keep dots and other characters (e.g. BRK.B, QQQ).
 */
export function alpacaPositionSymbol(symbol: string): string {
  const trimmed = symbol.trim();
  if (!trimmed.includes('/')) return trimmed;
  return trimmed.replaceAll('/', '');
}

/** Compare Alpaca position symbols (BTCUSD) with watchlist pairs (BTC/USD). */
export function alpacaSymbolsEqual(a: string, b: string): boolean {
  return alpacaPositionSymbol(a) === alpacaPositionSymbol(b);
}

export function alpacaPositionCloseUrl(baseUrl: string, symbol: string): string {
  const base = baseUrl.replace(/\/$/, '');
  const positionSymbol = alpacaPositionSymbol(symbol);
  return `${base}/v2/positions/${encodeURIComponent(positionSymbol)}`;
}
