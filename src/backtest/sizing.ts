/** Minimal copy of web/lib/sizing.ts for backtests (no web dependency). */

const TARGET_VOL = 0.12;
const TRADING_DAYS = 252;
const BASE_CAP = 0.25;
const MAX_PER_SYMBOL = 0.30;
const CASH_FLOOR = 0.10;

export interface SizingInputs {
  closes: number[];
  price: number;
  equity: number;
  availableCash: number;
}

export function realizedVolAnnual(closes: number[], lookback = 20): number | null {
  if (!closes || closes.length < lookback + 1) return null;
  const recent = closes.slice(-(lookback + 1));
  const rets: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    if (recent[i - 1]! <= 0 || recent[i]! <= 0) return null;
    rets.push(Math.log(recent[i]! / recent[i - 1]!));
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS);
}

export function computePositionSize(inp: SizingInputs): { shares: number; notional: number } {
  const { closes, price, equity, availableCash } = inp;
  const volAnnual = realizedVolAnnual(closes);
  const volTargetWeight = volAnnual && volAnnual > 0 ? TARGET_VOL / volAnnual : null;

  let weight = BASE_CAP;
  if (volTargetWeight != null) weight = Math.min(volTargetWeight, MAX_PER_SYMBOL, BASE_CAP);

  let notional = equity * weight;
  const maxByCash = availableCash - equity * CASH_FLOOR;
  if (notional > maxByCash) notional = Math.max(0, maxByCash);

  const shares = price > 0 ? Math.floor(notional / price) : 0;
  const finalNotional = shares > 0 ? +(shares * price).toFixed(2) : 0;
  return { shares, notional: finalNotional };
}
