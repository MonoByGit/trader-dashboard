import { filterByAssetClass } from '../../../src/asset-classes/classify';
import { foreignQtyFromRealBooks } from '../../../src/momentum2/book-aggregate';
import { m1CloseQty } from '../../../src/trading/strategy-tags';
import { loadRealBooks } from './ownership';

/**
 * ETF-posities die Momentum 1 zelf bezit (broker minus M2–M6 real books), met M1's eigen exposure
 * (marktwaarde pro rata). Eén DB-query voor alle posities.
 */
export async function m1EtfOpenSymbols(
  positions: Array<{ symbol: string; qty: string; asset_class?: string; market_value?: string }>,
): Promise<{ count: number; symbols: string[]; exposureUsd: number }> {
  const etf = filterByAssetClass(positions, 'etf');
  const books = etf.length ? await loadRealBooks() : [];
  const symbols: string[] = [];
  let exposureUsd = 0;
  for (const p of etf) {
    const brokerQty = parseFloat(p.qty);
    const own = m1CloseQty(brokerQty, foreignQtyFromRealBooks(books, p.symbol));
    if (own > 0) {
      symbols.push(p.symbol);
      const mv = parseFloat(p.market_value ?? '0');
      if (brokerQty > 0 && Number.isFinite(mv)) exposureUsd += mv * (own / brokerQty);
    }
  }
  return { count: symbols.length, symbols, exposureUsd };
}
