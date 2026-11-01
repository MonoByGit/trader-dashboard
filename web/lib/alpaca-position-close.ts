import { isCryptoSymbol } from '@/lib/asset-class';
import { alpacaPositionSymbol, alpacaSymbolsEqual } from '../../src/alpaca/symbol-path';
import { alpaca } from './alpaca';
import { exitCryptoPosition } from '@/lib/crypto/exit-crypto-position';
import { awaitStopOrderCanceled } from '../../src/crypto/cancel-stop-order';

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

async function closeEquityAfterCancelingOrders(symbol: string): Promise<unknown> {
  const open = await alpaca.openOrders(200);
  const toCancel = open.filter((o) => alpacaSymbolsEqual(o.symbol, symbol));
  for (const o of toCancel) {
    const outcome = await awaitStopOrderCanceled(o.id, {
      getOrder: (id) => alpaca.getOrder(id),
      cancelOrder: (id) => alpaca.cancelOrder(id),
    });
    if (outcome === 'failed' || outcome === 'timeout') {
      throw new Error(`Failed to cancel orders for ${symbol} (${outcome})`);
    }
  }
  return alpaca.closePosition(alpacaPositionSymbol(symbol));
}

/** Manual close: crypto uses the shared exit helper (lock + cancel confirm + close). */
export async function closePositionAfterCancelingOrders(symbol: string): Promise<unknown> {
  if (isCryptoSymbol(symbol)) {
    const result = await exitCryptoPosition(symbol, 'manual_close', { mode: 'close_position' });
    if (result.skippedReason === 'locked') {
      throw new Error(`Exit locked for ${symbol}`);
    }
    if (result.skippedReason === 'cancel_failed' || result.skippedReason === 'cancel_timeout') {
      throw new Error(`Failed to cancel orders for ${symbol} (${result.skippedReason})`);
    }
    return result;
  }
  return closeEquityAfterCancelingOrders(symbol);
}
