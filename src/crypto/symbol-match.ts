import { alpacaSymbolsEqual } from '../alpaca/symbol-path.js';

export function cryptoSymbolExposureUsd(
  positions: { symbol: string; market_value: string }[],
  candidateSymbol: string,
): number {
  return positions
    .filter((p) => alpacaSymbolsEqual(p.symbol, candidateSymbol))
    .reduce((s, p) => s + parseFloat(p.market_value), 0);
}

export function hasCryptoPosition(
  positions: { symbol: string }[],
  candidateSymbol: string,
): boolean {
  return positions.some((p) => alpacaSymbolsEqual(p.symbol, candidateSymbol));
}

export function openOrderMatchesSymbol(
  order: { symbol: string },
  candidateSymbol: string,
): boolean {
  return alpacaSymbolsEqual(order.symbol, candidateSymbol);
}
