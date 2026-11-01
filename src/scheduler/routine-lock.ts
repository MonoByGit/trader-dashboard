/** DB lock slot: one active run per routine per trading day (ETF) or UTC 2h grid (crypto). */
export function routineLockSlotKey(routine: string, tradingDateEt: string, nowMs: number): string {
  if (routine.startsWith('crypto')) {
    const d = new Date(nowMs);
    const slot = Math.floor(d.getUTCHours() / 2);
    return `${d.toISOString().slice(0, 10)}-utc-${slot}`;
  }
  return tradingDateEt;
}
