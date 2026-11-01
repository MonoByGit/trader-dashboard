export type OpenStopOrder = {
  side: string;
  type: string;
  status: string;
  limit_price: string | null;
};

/** Broker stop-limit is stuck or gapped through; cancel it and use software backup. */
export function stopOrderNeedsSoftwareBackup(order: OpenStopOrder, lastPrice: number): boolean {
  if (order.side !== 'sell') return false;
  if (order.type === 'stop_limit') {
    const limit = parseFloat(order.limit_price ?? '0');
    if (limit > 0 && lastPrice < limit) return true;
    if (order.status === 'triggered' || order.status === 'stopped') return true;
  }
  if (order.type === 'stop' && (order.status === 'triggered' || order.status === 'stopped')) {
    return true;
  }
  return false;
}

/**
 * When price is at or below the software stop, return true if open broker stop orders
 * still protect the position (backup should not fire).
 */
export function brokerStopOrdersBlockSoftwareBackup(
  orders: OpenStopOrder[],
  lastPrice: number,
  softwareStopPrice: number,
): boolean {
  if (lastPrice > softwareStopPrice) return true;

  const sellStops = orders.filter(
    (o) => o.side === 'sell' && (o.type === 'stop_limit' || o.type === 'stop'),
  );
  if (!sellStops.length) return false;

  if (sellStops.some((o) => stopOrderNeedsSoftwareBackup(o, lastPrice))) {
    return false;
  }

  return sellStops.some(
    (o) => o.status === 'new' || o.status === 'accepted' || o.status === 'held',
  );
}
