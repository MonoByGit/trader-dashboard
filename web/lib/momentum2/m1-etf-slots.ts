import { filterByAssetClass } from '../../../src/asset-classes/classify';
import { m1CloseQty } from '../../../src/trading/strategy-tags';
import { foreignQtyForSymbol } from './ownership';

/** ETF-posities die Momentum 1 zelf bezit (broker minus M2–M6 real books). */
export async function m1EtfOpenSymbols(
  positions: Array<{ symbol: string; qty: string; asset_class?: string }>,
): Promise<{ count: number; symbols: string[] }> {
  const etf = filterByAssetClass(positions, 'etf');
  const symbols: string[] = [];
  for (const p of etf) {
    const brokerQty = parseFloat(p.qty);
    const foreign = await foreignQtyForSymbol(p.symbol);
    if (m1CloseQty(brokerQty, foreign) > 0) symbols.push(p.symbol);
  }
  return { count: symbols.length, symbols };
}
