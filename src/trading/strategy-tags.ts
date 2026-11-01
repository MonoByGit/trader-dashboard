/**
 * Elke strategie beheert alleen haar eigen posities. Orders van andere strategieën dan Momentum 1
 * dragen een client_order_id met een van deze prefixen (m2s- = Momentum 2 stop, enz.).
 */
export const FOREIGN_STRATEGY_PREFIXES = ['m2-', 'm2s-', 'm3-', 'm3s-', 'm4-', 'm4s-'] as const;

export function isForeignStrategyOrder(clientOrderId: string | undefined | null): boolean {
  return !!clientOrderId && FOREIGN_STRATEGY_PREFIXES.some((p) => clientOrderId.startsWith(p));
}

/** Hoeveel Momentum 1 aan het eind van de dag mag sluiten: de brokerpositie min wat andere strategieën bezitten. */
export function m1CloseQty(brokerQty: number, foreignQty: number): number {
  return Math.max(0, brokerQty - Math.max(0, foreignQty));
}
