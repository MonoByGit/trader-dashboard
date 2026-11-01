/** Fields that equity snapshot sync may write — never emergencyStop / tradingEnabled. */
export type EquitySyncFields = {
  tradingDay?: string;
  dayStartEquity?: number;
  sessionPeakEquity?: number;
  consecutiveLosses?: number;
};

export function equitySyncPersistPatch(updates: EquitySyncFields): EquitySyncFields {
  const patch: EquitySyncFields = {};
  if (updates.tradingDay !== undefined) patch.tradingDay = updates.tradingDay;
  if (updates.dayStartEquity !== undefined) patch.dayStartEquity = updates.dayStartEquity;
  if (updates.sessionPeakEquity !== undefined) patch.sessionPeakEquity = updates.sessionPeakEquity;
  if (updates.consecutiveLosses !== undefined) patch.consecutiveLosses = updates.consecutiveLosses;
  return patch;
}
