export function nextConsecutiveLosses(current: number, realizedPnl: number): number {
  if (realizedPnl > 0) return 0;
  if (realizedPnl < 0) return current + 1;
  return current;
}
