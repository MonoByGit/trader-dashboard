export type OpenSellLeg = { id: string; status: string };

export function openSellLegsStillActive(legs: OpenSellLeg[]): OpenSellLeg[] {
  const openStatuses = new Set([
    'new',
    'accepted',
    'held',
    'partially_filled',
    'pending_new',
    'pending_cancel',
  ]);
  return legs.filter((o) => openStatuses.has(o.status));
}

export function flattenReadyAfterCancels(legs: OpenSellLeg[]): boolean {
  return openSellLegsStillActive(legs).length === 0;
}

export function isOpenSellLegStatus(status: string): boolean {
  const openStatuses = new Set([
    'new',
    'accepted',
    'held',
    'partially_filled',
    'pending_new',
    'pending_cancel',
  ]);
  return openStatuses.has(status);
}
