import { alpacaPositionSymbol, alpacaSymbolsEqual } from '../../src/alpaca/symbol-path';
import { alpaca } from './alpaca';

async function waitUntilOrdersGone(orderIds: string[], attempts = 12): Promise<void> {
  if (!orderIds.length) return;
  for (let i = 0; i < attempts; i++) {
    const open = await alpaca.openOrders(200);
    const stillOpen = orderIds.filter((id) => open.some((o) => o.id === id));
    if (!stillOpen.length) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Orders still open after cancel: ${orderIds.join(',')}`);
}

/** Cancel all open orders for a symbol, wait for confirmation, then close the position. */
export async function closePositionAfterCancelingOrders(symbol: string): Promise<unknown> {
  const open = await alpaca.openOrders(200);
  const toCancel = open.filter((o) => alpacaSymbolsEqual(o.symbol, symbol));
  for (const o of toCancel) {
    await alpaca.cancelOrder(o.id);
  }
  await waitUntilOrdersGone(toCancel.map((o) => o.id));
  return alpaca.closePosition(alpacaPositionSymbol(symbol));
}
