export type OpenStopOrder = {
  side: string;
  type: string;
  status: string;
  limit_price: string | null;
};

/** Price gapped below the stop-limit limit — broker order cannot fill at current price. */
export function stopLimitGappedThroughLimit(order: OpenStopOrder, lastPrice: number): boolean {
  if (order.side !== 'sell' || order.type !== 'stop_limit') return false;
  const limit = parseFloat(order.limit_price ?? '0');
  return limit > 0 && lastPrice < limit;
}

/** Any open sell stop blocks software backup unless it provably gapped through its limit. */
export function openSellStopBlocksSoftwareBackup(order: OpenStopOrder, lastPrice: number): boolean {
  if (order.side !== 'sell') return false;
  if (order.type !== 'stop_limit' && order.type !== 'stop') return false;
  if (order.status === 'stopped') return true;
  if (order.type === 'stop_limit') {
    return !stopLimitGappedThroughLimit(order, lastPrice);
  }
  return true;
}

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

  return sellStops.some((o) => openSellStopBlocksSoftwareBackup(o, lastPrice));
}
