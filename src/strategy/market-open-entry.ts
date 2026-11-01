/** Breakout chase guard: reject entry when quote is too far above last bar close. */
export function breakoutChaseBlocked(
  lastBarClose: number,
  entryReferencePrice: number,
  chaseLimitPct: number,
): string | null {
  if (lastBarClose <= 0 || chaseLimitPct <= 0) return null;
  const maxPrice = lastBarClose * (1 + chaseLimitPct);
  if (entryReferencePrice > maxPrice) {
    return `Chase ${(((entryReferencePrice - lastBarClose) / lastBarClose) * 100).toFixed(2)}% exceeds limit ${(chaseLimitPct * 100).toFixed(0)}%`;
  }
  return null;
}

export function bracketPricesFromEntry(
  entryPrice: number,
  hardStopPct: number,
  takeProfitPct: number,
): { stopPrice: number; takeProfitPrice: number } {
  return {
    stopPrice: +(entryPrice * (1 - hardStopPct)).toFixed(2),
    takeProfitPrice: +(entryPrice * (1 + takeProfitPct)).toFixed(2),
  };
}

/** Mid quote for sizing and brackets when latest quote is available. */
export function midQuotePrice(quote: { ap: number; bp: number } | undefined): number | null {
  if (!quote) return null;
  const ap = quote.ap;
  const bp = quote.bp;
  if (!(ap > 0) || !(bp > 0)) return null;
  return +((ap + bp) / 2).toFixed(4);
}
