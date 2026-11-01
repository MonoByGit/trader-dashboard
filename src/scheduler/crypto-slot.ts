/** UTC 2h scan slot id (aligned with decideDueCryptoRoutines hour grid). */
export function utcCryptoScanSlot(nowMs: number, tickIntervalHours: number): string {
  if (!Number.isFinite(nowMs) || tickIntervalHours <= 0) return '__invalid__';
  const t = new Date(nowMs).getTime();
  if (!Number.isFinite(t)) return '__invalid__';
  const d = new Date(t);
  const slot = Math.floor(d.getUTCHours() / tickIntervalHours);
  return `${d.toISOString().slice(0, 10)}-${slot}`;
}

/** True while `nowMs` is still inside the current UTC slot window (e.g. hours 10–11 for a 2h grid). */
export function isInUtcCryptoSlotWindow(nowMs: number, tickIntervalHours: number): boolean {
  if (!Number.isFinite(nowMs) || tickIntervalHours <= 0) return false;
  const h = new Date(nowMs).getUTCHours();
  const slot = Math.floor(h / tickIntervalHours);
  const slotStart = slot * tickIntervalHours;
  return h >= slotStart && h < slotStart + tickIntervalHours;
}
