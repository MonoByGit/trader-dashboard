import { classifySymbol } from '@/lib/asset-class';
import { alpacaPositionSymbol, alpacaSymbolsEqual } from '../../src/alpaca/symbol-path';
import { alpaca } from './alpaca';
import { exitCryptoPosition } from '@/lib/crypto/exit-crypto-position';
import { awaitStopOrderCanceled } from '../../src/crypto/cancel-stop-order';

export type ClosePositionAlreadyClosed = {
  alreadyClosed: true;
  reason: 'broker_filled';
};

async function isCryptoPositionSymbol(symbol: string): Promise<boolean> {
  if (classifySymbol(symbol) === 'crypto') return true;
  const positions = await alpaca.positions();
  const pos = positions.find((p) => alpacaSymbolsEqual(p.symbol, symbol));
  if (!pos) return false;
  return classifySymbol(pos.symbol, pos.asset_class) === 'crypto';
}

async function closeEquityAfterCancelingOrders(
  symbol: string,
): Promise<unknown | ClosePositionAlreadyClosed> {
  const open = await alpaca.openOrders(200);
  const toCancel = open.filter((o) => alpacaSymbolsEqual(o.symbol, symbol));
  for (const o of toCancel) {
    const outcome = await awaitStopOrderCanceled(o.id, {
      getOrder: (id) => alpaca.getOrder(id),
      cancelOrder: (id) => alpaca.cancelOrder(id),
    });
    if (outcome === 'filled') {
      return { alreadyClosed: true, reason: 'broker_filled' };
    }
    if (outcome === 'failed' || outcome === 'timeout') {
      throw new Error(`Failed to cancel orders for ${symbol} (${outcome})`);
    }
  }
  return alpaca.closePosition(alpacaPositionSymbol(symbol));
}

/** Manual close: crypto uses the shared exit helper (lock + cancel confirm + close). */
export async function closePositionAfterCancelingOrders(
  symbol: string,
): Promise<unknown | ClosePositionAlreadyClosed> {
  if (await isCryptoPositionSymbol(symbol)) {
    const result = await exitCryptoPosition(symbol, 'manual_close', { mode: 'close_position' });
    if (result.skippedReason === 'locked' || result.skippedReason === 'lock_lost') {
      throw new Error(`Exit locked for ${symbol}`);
    }
    if (result.skippedReason === 'broker_filled') {
      return { alreadyClosed: true, reason: 'broker_filled' };
    }
    if (result.skippedReason === 'cancel_failed' || result.skippedReason === 'cancel_timeout') {
      throw new Error(`Failed to cancel orders for ${symbol} (${result.skippedReason})`);
    }
    return result;
  }
  return closeEquityAfterCancelingOrders(symbol);
}
