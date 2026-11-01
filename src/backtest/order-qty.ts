/** Share/qty from notional — whole shares for ETFs, fractional for crypto (Alpaca-style). */

export const CRYPTO_QTY_DECIMALS = 8;
export const CRYPTO_MIN_QTY = 0.0001;
/** Alpaca crypto minimum order notional (USD). */
export const CRYPTO_MIN_NOTIONAL_USD = 1;

export type QtyMode = 'whole' | 'fractional';

export function roundDownDecimals(value: number, decimals: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const factor = 10 ** decimals;
  return Math.floor(value * factor) / factor;
}

export function qtyFromNotional(
  notional: number,
  price: number,
  mode: QtyMode,
): number {
  if (!Number.isFinite(notional) || !Number.isFinite(price) || notional <= 0 || price <= 0) {
    return 0;
  }
  if (mode === 'whole') {
    return Math.floor(notional / price);
  }

  let qty = roundDownDecimals(notional / price, CRYPTO_QTY_DECIMALS);
  if (qty > 0 && qty < CRYPTO_MIN_QTY) {
    const minQtyNotional = CRYPTO_MIN_QTY * price;
    if (notional >= CRYPTO_MIN_NOTIONAL_USD && minQtyNotional >= CRYPTO_MIN_NOTIONAL_USD) {
      qty = CRYPTO_MIN_QTY;
    } else {
      qty = 0;
    }
  }
  if (qty <= 0) return 0;
  if (qty * price < CRYPTO_MIN_NOTIONAL_USD) return 0;
  return qty;
}

export function qtyModeForAssetClass(assetClass?: 'etf' | 'crypto'): QtyMode {
  return assetClass === 'crypto' ? 'fractional' : 'whole';
}
