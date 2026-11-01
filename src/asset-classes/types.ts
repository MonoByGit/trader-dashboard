/** Tradable sleeves — keep ETF and crypto strictly separated in data and UI. */
export type AssetClassId = 'etf' | 'crypto';

export const ASSET_CLASS_LABELS: Record<AssetClassId, string> = {
  etf: 'ETF',
  crypto: 'Crypto',
};

export interface SleevePerformanceLine {
  assetClass: AssetClassId;
  equityUsd: number;
  dailyReturnPct: number | null;
  cumulativeReturnPct: number | null;
  benchmarkSymbol: string;
  benchmarkDailyReturnPct: number | null;
  benchmarkCumulativeReturnPct: number | null;
}

export interface CombinedPerformance {
  equityUsd: number;
  dailyReturnPct: number | null;
  cumulativeReturnPct: number | null;
}
