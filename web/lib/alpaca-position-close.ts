import { alpacaPositionSymbol, alpacaSymbolsEqual } from '../../src/alpaca/symbol-path';
import { alpaca } from './alpaca';

export class ClosePositionOrdersTimeoutError extends Error {
  constructor(
    message: string,
    readonly canceledOrderIds: string[],
    readonly stillOpenOrderIds: string[],
  ) {
    super(message);
    this.name = 'ClosePositionOrdersTimeoutError';
  }
}

async function waitUntilOrdersGone(orderIds: string[], attempts = 12): Promise<void> {
  if (!orderIds.length) return;
  for (let i = 0; i < attempts; i++) {
    const open = await alpaca.openOrders(200);
    const stillOpen = orderIds.filter((id) => open.some((o) => o.id === id));
    if (!stillOpen.length) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  const open = await alpaca.openOrders(200);
  const stillOpen = orderIds.filter((id) => open.some((o) => o.id === id));
  throw new ClosePositionOrdersTimeoutError(
    'Open orders were canceled but not confirmed gone; position may still be open without stop protection.',
    orderIds.filter((id) => !stillOpen.includes(id)),
    stillOpen,
  );
}

/** Cancel all open orders for a symbol, wait for confirmation, then close the position. */
export async function closePositionAfterCancelingOrders(symbol: string): Promise<unknown> {
  const open = await alpaca.openOrders(200);
  const toCancel = open.filter((o) => alpacaSymbolsEqual(o.symbol, symbol));
  const cancelErrors: string[] = [];
  for (const o of toCancel) {
    try {
      await alpaca.cancelOrder(o.id);
    } catch (e) {
      cancelErrors.push(`${o.id}: ${String(e)}`);
    }
  }
  if (cancelErrors.length) {
    throw new Error(`Failed to cancel orders for ${symbol}: ${cancelErrors.join('; ')}`);
  }
  await waitUntilOrdersGone(toCancel.map((o) => o.id));
  return alpaca.closePosition(alpacaPositionSymbol(symbol));
}
