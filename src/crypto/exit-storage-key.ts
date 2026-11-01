import { alpacaPositionSymbol } from '../alpaca/symbol-path.js';

export function cryptoTpStorageKey(symbol: string): string {
  return `crypto_tp:${alpacaPositionSymbol(symbol)}`;
}

export function legacyCryptoTpStorageKeys(symbol: string): string[] {
  const compact = alpacaPositionSymbol(symbol);
  const keys = new Set<string>();
  const trimmed = symbol.trim();
  if (trimmed && trimmed !== compact) {
    keys.add(`crypto_tp:${trimmed}`);
  }
  if (!compact.includes('/') && compact.endsWith('USD') && compact.length > 3) {
    keys.add(`crypto_tp:${compact.slice(0, -3)}/USD`);
  }
  keys.delete(cryptoTpStorageKey(symbol));
  return Array.from(keys);
}

export function cryptoTpLookupKeys(symbol: string): string[] {
  const primary = cryptoTpStorageKey(symbol);
  return [primary, ...legacyCryptoTpStorageKeys(symbol)];
}
