import type { AssetClassId } from './types';

const CRYPTO_SUFFIX = '/USD';

/** Alpaca crypto pairs use BASE/USD; equities are plain tickers. */
export function classifySymbol(symbol: string, assetClassHint?: string | null): AssetClassId {
  if (assetClassHint === 'crypto' || assetClassHint === 'us_equity') {
    return assetClassHint === 'crypto' ? 'crypto' : 'etf';
  }
  if (symbol.includes('/')) return 'crypto';
  if (symbol.endsWith('USD') && symbol.length > 3 && symbol.includes(CRYPTO_SUFFIX)) return 'crypto';
  return 'etf';
}

export function isCryptoSymbol(symbol: string): boolean {
  return classifySymbol(symbol) === 'crypto';
}

export function filterByAssetClass<T extends { symbol: string; asset_class?: string }>(
  items: T[],
  assetClass: AssetClassId,
): T[] {
  return items.filter((p) => classifySymbol(p.symbol, p.asset_class) === assetClass);
}
