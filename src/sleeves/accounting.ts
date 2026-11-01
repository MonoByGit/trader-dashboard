import { classifySymbol } from '../asset-classes/classify';
import type { AssetClassId } from '../asset-classes/types';

export interface PositionLike {
  symbol: string;
  market_value: string | number;
  unrealized_pl?: string | number;
  cost_basis?: string | number;
  asset_class?: string;
}

export interface SleeveBooks {
  assetClass: AssetClassId;
  exposureUsd: number;
  unrealizedPlUsd: number;
  realizedPlUsd: number;
  allocatedCashUsd: number;
  equityUsd: number;
  positionCount: number;
}

export interface SleeveAccountingResult {
  combinedEquityUsd: number;
  combinedCashUsd: number;
  etf: SleeveBooks;
  crypto: SleeveBooks;
}

function num(v: string | number | undefined): number {
  if (v === undefined) return 0;
  return typeof v === 'number' ? v : parseFloat(v) || 0;
}

/**
 * Paper account has one cash pool; sleeves get notional budget + cash headroom for reporting.
 * cryptoBudgetPct = max fraction of total equity that may sit in crypto exposure (default 20%).
 */
export function computeSleeveAccounting(input: {
  totalEquityUsd: number;
  totalCashUsd: number;
  positions: PositionLike[];
  cryptoBudgetPct: number;
  cryptoModuleEnabled: boolean;
  realizedPlByClass?: Partial<Record<AssetClassId, number>>;
}): SleeveAccountingResult {
  const { totalEquityUsd, totalCashUsd, positions, cryptoBudgetPct, cryptoModuleEnabled } = input;
  const realized = input.realizedPlByClass ?? {};

  const buckets: Record<AssetClassId, { exposure: number; unrealized: number; count: number }> = {
    etf: { exposure: 0, unrealized: 0, count: 0 },
    crypto: { exposure: 0, unrealized: 0, count: 0 },
  };

  for (const p of positions) {
    const ac = classifySymbol(p.symbol, p.asset_class);
    const mv = num(p.market_value);
    buckets[ac].exposure += mv;
    buckets[ac].unrealized += num(p.unrealized_pl);
    buckets[ac].count += 1;
  }

  const cryptoMaxUsd = cryptoModuleEnabled ? totalEquityUsd * (cryptoBudgetPct / 100) : 0;
  const cryptoHeadroom = Math.max(0, cryptoMaxUsd - buckets.crypto.exposure);
  const cryptoCashAssigned = cryptoModuleEnabled
    ? Math.min(totalCashUsd, cryptoHeadroom)
    : 0;
  const etfCashAssigned = Math.max(0, totalCashUsd - cryptoCashAssigned);

  const mk = (ac: AssetClassId): SleeveBooks => ({
    assetClass: ac,
    exposureUsd: buckets[ac].exposure,
    unrealizedPlUsd: buckets[ac].unrealized,
    realizedPlUsd: realized[ac] ?? 0,
    allocatedCashUsd: ac === 'crypto' ? cryptoCashAssigned : etfCashAssigned,
    equityUsd: buckets[ac].exposure + (ac === 'crypto' ? cryptoCashAssigned : etfCashAssigned),
    positionCount: buckets[ac].count,
  });

  return {
    combinedEquityUsd: totalEquityUsd,
    combinedCashUsd: totalCashUsd,
    etf: mk('etf'),
    crypto: mk('crypto'),
  };
}
