/**
 * Alpaca treats date-only `end` as midnight UTC, which excludes the current ET
 * session daily bar (timestamp ~04:00/05:00Z). Use exclusive end = start of next ET calendar day.
 */
export function alpacaStockDailyEndExclusiveUtc(tradingDateYmd: string): string {
  const d = new Date(`${tradingDateYmd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
