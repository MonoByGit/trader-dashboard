/** Sum Alpaca position change_today (USD) for crypto sleeve daily P&L. */
export function sumCryptoChangeTodayUsd(
  positions: Array<{ change_today?: string | number }>,
): number {
  let total = 0;
  for (const p of positions) {
    const v = p.change_today;
    if (v === undefined || v === '') continue;
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

/** Loss as % of total account equity (positive number = loss). */
export function cryptoDailyLossPctOfAccount(
  totalEquityUsd: number,
  cryptoDailyPnlUsd: number,
): number {
  if (totalEquityUsd <= 0) return 0;
  if (cryptoDailyPnlUsd >= 0) return 0;
  return (-cryptoDailyPnlUsd / totalEquityUsd) * 100;
}
