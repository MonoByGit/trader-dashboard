import { dbRun, hasDb } from '@/lib/db';
import { ensureSchema } from '@/lib/migrate';
import { awaitOrderFilled, awaitStopOrderCanceled } from '../../../src/crypto/cancel-stop-order';
import { cryptoStopLookupKeys } from '../../../src/crypto/stop-storage-key';
import { cryptoTpLookupKeys } from '../../../src/crypto/exit-storage-key';
import { positionQtyAvailable } from '../../../src/crypto/buy-fill-qty';
import { alpacaPositionSymbol, alpacaSymbolsEqual } from '../../../src/alpaca/symbol-path';
import { alpaca } from '@/lib/alpaca';
import { logGuardEvent } from '@/lib/guards/service';
import { acquireExitLock, releaseExitLock } from './exit-lock';

export type CryptoExitReason = 'software_stop' | 'take_profit' | 'manual_close' | 'emergency_flatten' | (string & {});

export type ExitCryptoPositionMode = 'market_sell' | 'close_position';

export type ExitCryptoPositionResult = {
  exited: boolean;
  orderId?: string;
  skippedReason?: 'locked' | 'no_qty' | 'broker_filled' | 'cancel_failed' | 'cancel_timeout';
};

export async function clearCryptoExitSettings(symbol: string): Promise<void> {
  if (!hasDb()) return;
  await ensureSchema();
  const keys = Array.from(new Set([...cryptoStopLookupKeys(symbol), ...cryptoTpLookupKeys(symbol)]));
  for (const key of keys) {
    await dbRun(`DELETE FROM settings WHERE key=$1`, [key]);
  }
}

async function logExitReason(symbol: string, reason: CryptoExitReason, detail: string): Promise<void> {
  if (reason === 'software_stop') {
    await logGuardEvent('crypto_software_stop', detail, { symbol, reason });
    return;
  }
  if (reason === 'take_profit') {
    await logGuardEvent('crypto_take_profit', detail, { symbol, reason });
    return;
  }
  await logGuardEvent('crypto_exit', detail, { symbol, reason });
}

async function cancelOpenSellOrders(symbol: string, reason: CryptoExitReason): Promise<ExitCryptoPositionResult | null> {
  const open = await alpaca.openOrders(200);
  const sellOrders = open.filter(
    (o) => o.side === 'sell' && alpacaSymbolsEqual(o.symbol, symbol),
  );

  for (const o of sellOrders) {
    const outcome = await awaitStopOrderCanceled(o.id, {
      getOrder: (id) => alpaca.getOrder(id),
      cancelOrder: (id) => alpaca.cancelOrder(id),
    });
    if (outcome === 'filled') {
      await clearCryptoExitSettings(symbol);
      return { exited: false, skippedReason: 'broker_filled' };
    }
    if (outcome === 'timeout') {
      await logGuardEvent('crypto_exit_cancel_timeout', `Cancel poll timed out for ${o.id}`, {
        symbol,
        orderId: o.id,
        reason,
      });
      return { exited: false, skippedReason: 'cancel_timeout' };
    }
    if (outcome === 'failed') {
      await logGuardEvent('crypto_exit_cancel_fail', `Could not cancel ${o.id}`, {
        symbol,
        orderId: o.id,
        reason,
      });
      return { exited: false, skippedReason: 'cancel_failed' };
    }
  }
  return null;
}

/**
 * Single exit path for crypto: cancel open sells, confirm cancels, exit position, clear stop/tp keys.
 * Idempotent per symbol via in-process + DB lock (2-minute stale takeover).
 */
export async function exitCryptoPosition(
  symbol: string,
  reason: CryptoExitReason,
  options?: { mode?: ExitCryptoPositionMode },
): Promise<ExitCryptoPositionResult> {
  const mode = options?.mode ?? 'market_sell';
  const { acquired, owner } = await acquireExitLock(symbol);
  if (!acquired || !owner) {
    return { exited: false, skippedReason: 'locked' };
  }

  try {
    const cancelBlock = await cancelOpenSellOrders(symbol, reason);
    if (cancelBlock) return cancelBlock;

    const positions = await alpaca.positions();
    const pos = positions.find((p) => alpacaSymbolsEqual(p.symbol, symbol));
    const sellQty = pos ? positionQtyAvailable(pos) : 0;
    if (!(sellQty > 0)) {
      await clearCryptoExitSettings(symbol);
      return { exited: false, skippedReason: 'no_qty' };
    }

    if (mode === 'close_position') {
      await logExitReason(symbol, reason, `Close position ${sellQty} (${reason})`);
      await alpaca.closePosition(alpacaPositionSymbol(symbol));
      await clearCryptoExitSettings(symbol);
      return { exited: true };
    }

    await logExitReason(symbol, reason, `Market sell ${sellQty} (${reason})`);
    const order = await alpaca.placeOrder({
      symbol,
      qty: sellQty,
      side: 'sell',
      type: 'market',
      time_in_force: 'gtc',
    });
    const filled = await awaitOrderFilled(order.id, (id) => alpaca.getOrder(id));
    if (filled) {
      await clearCryptoExitSettings(symbol);
    }
    return { exited: true, orderId: order.id };
  } finally {
    await releaseExitLock(symbol, owner);
  }
}
