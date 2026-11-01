import { alpacaPositionSymbol } from '../alpaca/symbol-path.js';

/** Canonical settings key for software crypto stops (Alpaca compact symbol). */
export function cryptoStopStorageKey(symbol: string): string {
  return `crypto_stop:${alpacaPositionSymbol(symbol)}`;
}

/** Pre-normalization keys (slash pair form from watchlist saves). */
export function legacyCryptoStopStorageKeys(symbol: string): string[] {
  const compact = alpacaPositionSymbol(symbol);
  const keys = new Set<string>();

  const trimmed = symbol.trim();
  if (trimmed && trimmed !== compact) {
    keys.add(`crypto_stop:${trimmed}`);
  }

  if (!compact.includes('/') && compact.endsWith('USD') && compact.length > 3) {
    keys.add(`crypto_stop:${compact.slice(0, -3)}/USD`);
  }

  keys.delete(cryptoStopStorageKey(symbol));
  return Array.from(keys);
}

/** Primary key first, then legacy fallbacks for load. */
export function cryptoStopLookupKeys(symbol: string): string[] {
  const primary = cryptoStopStorageKey(symbol);
  return [primary, ...legacyCryptoStopStorageKeys(symbol)];
}
