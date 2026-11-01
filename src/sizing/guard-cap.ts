/** Clamp vol-target / Kelly sizing to portfolio guard max position size (%). */
export function clampWeightToGuardCap(weight: number, maxPositionSizePct: number): number {
  const cap = maxPositionSizePct / 100;
  if (!Number.isFinite(cap) || cap <= 0) return weight;
  return Math.min(weight, cap);
}
