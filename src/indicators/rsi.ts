/**
 * RSI(period) with Wilder smoothing on the full close series.
 * Returns null when fewer than period+1 closes are available.
 */
export function rsiWilder(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;

  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i]! - closes[i - 1]!);
  }

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    const d = changes[i]!;
    if (d >= 0) avgGain += d;
    else avgLoss += -d;
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < changes.length; i++) {
    const d = changes[i]!;
    const gain = d >= 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** RSI(14) using up to the last 60 closes (live routines / backtest). */
export function rsi14(closes: number[]): number | null {
  const tail = closes.length > 60 ? closes.slice(-60) : closes;
  const v = rsiWilder(tail, 14);
  return v == null ? null : +v.toFixed(1);
}
