export type AssetClassId = 'etf' | 'crypto';

export function assetClassForSymbol(symbol: string, positionAssetClass?: string): AssetClassId {
  if (positionAssetClass === 'crypto') return 'crypto';
  if (symbol.includes('/')) return 'crypto';
  return 'etf';
}
