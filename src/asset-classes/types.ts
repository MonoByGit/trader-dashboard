/** Pluggable asset-class identifiers for Momentum. */
export type AssetClassId = 'etf' | 'crypto';

export interface AssetClassDescriptor {
  id: AssetClassId;
  label: string;
}

export const ASSET_CLASSES: Record<AssetClassId, AssetClassDescriptor> = {
  etf: { id: 'etf', label: 'US ETFs' },
  crypto: { id: 'crypto', label: 'Crypto (24/7)' },
};
