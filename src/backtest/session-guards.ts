export type BacktestSessionGuardState = {
  consecutiveLosses: number;
  circuitBreakerTripped: boolean;
  sessionPeakEquity: number;
  dayStartEquity: number;
};

/** Mirror live syncEquitySnapshots when the trading calendar advances. */
export function rollBacktestSessionGuards(
  prevDate: string | null,
  date: string,
  state: Pick<BacktestSessionGuardState, 'dayStartEquity'>,
): Partial<BacktestSessionGuardState> | null {
  if (prevDate == null || prevDate === date) return null;
  return {
    consecutiveLosses: 0,
    circuitBreakerTripped: false,
    sessionPeakEquity: state.dayStartEquity,
  };
}
