/** Increment local counter after each successful buy in a routine run. */
export function nextDailyTradeCount(current: number, maxDailyTrades: number): {
  allowed: boolean;
  next: number;
} {
  if (current >= maxDailyTrades) {
    return { allowed: false, next: current };
  }
  return { allowed: true, next: current + 1 };
}
