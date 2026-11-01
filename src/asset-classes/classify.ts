import type { AssetClassId } from './types';

/** Alpaca crypto pairs use BASE/USD; equities are plain tickers. */
export function classifySymbol(symbol: string, assetClassHint?: string | null): AssetClassId {
  if (assetClassHint === 'crypto') return 'crypto';
  if (assetClassHint === 'us_equity' || assetClassHint === 'etf') return 'etf';
  if (symbol.includes('/')) return 'crypto';
  // Alpaca position symbols omit the slash (e.g. BTCUSD); avoid matching equity tickers that rarely end in USD.
  if (!symbol.includes('/') && /^[A-Z0-9]{2,12}USD$/.test(symbol)) return 'crypto';
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
