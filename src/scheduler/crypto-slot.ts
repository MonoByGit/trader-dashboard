/** UTC 2h scan slot id (aligned with decideDueCryptoRoutines hour grid). */
export function utcCryptoScanSlot(nowMs: number, tickIntervalHours: number): string {
  const d = new Date(nowMs);
  const slot = Math.floor(d.getUTCHours() / tickIntervalHours);
  return `${d.toISOString().slice(0, 10)}-${slot}`;
}
