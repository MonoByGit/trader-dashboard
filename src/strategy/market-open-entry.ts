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

export type QuoteEntryResult =
  | { price: number; source: 'mid' | 'ask_wide_spread' }
  | { error: 'no_quote' };

/** Live entry reference; wide spread (> maxSpreadPct) falls back to ask. */
export function entryPriceFromQuote(
  quote: { ap: number; bp: number } | undefined,
  maxSpreadPct = 0.005,
): QuoteEntryResult {
  if (!quote) return { error: 'no_quote' };
  const ap = quote.ap;
  const bp = quote.bp;
  if (!(ap > 0) || !(bp > 0)) return { error: 'no_quote' };
  const mid = (ap + bp) / 2;
  const spreadPct = (ap - bp) / mid;
  if (spreadPct > maxSpreadPct) {
    return { price: ap, source: 'ask_wide_spread' };
  }
  return { price: +mid.toFixed(4), source: 'mid' };
}
