import { dbQuery, dbRun, hasDb } from '@/lib/db';
import { ensureSchema } from '@/lib/migrate';
import { awaitStopOrderCanceled } from '../../../src/crypto/cancel-stop-order';
import { cryptoStopLookupKeys } from '../../../src/crypto/stop-storage-key';
import { cryptoTpLookupKeys } from '../../../src/crypto/exit-storage-key';
import { positionQtyAvailable } from '../../../src/crypto/buy-fill-qty';
import { alpacaPositionSymbol, alpacaSymbolsEqual } from '../../../src/alpaca/symbol-path';
import { alpaca } from '@/lib/alpaca';
import { logGuardEvent } from '@/lib/guards/service';

export type CryptoExitReason = 'software_stop' | 'take_profit' | (string & {});

export type ExitCryptoPositionResult = {
  exited: boolean;
  orderId?: string;
  skippedReason?: 'locked' | 'no_qty' | 'broker_filled' | 'cancel_failed';
};

const inProcessExitLocks = new Set<string>();

function exitLockKey(symbol: string): string {
  return `crypto_exit_lock:${alpacaPositionSymbol(symbol)}`;
}

async function acquireExitLock(symbol: string): Promise<boolean> {
  const compact = alpacaPositionSymbol(symbol);
  if (inProcessExitLocks.has(compact)) return false;
  inProcessExitLocks.add(compact);

  if (hasDb()) {
    await ensureSchema();
    const rows = await dbQuery<{ key: string }>(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO NOTHING RETURNING key`,
      [exitLockKey(symbol), new Date().toISOString()],
    );
    if (!rows.length) {
      inProcessExitLocks.delete(compact);
      return false;
    }
  }
  return true;
}

async function releaseExitLock(symbol: string): Promise<void> {
  const compact = alpacaPositionSymbol(symbol);
  inProcessExitLocks.delete(compact);
  if (!hasDb()) return;
  await dbRun(`DELETE FROM settings WHERE key=$1`, [exitLockKey(symbol)]);
}

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

/**
 * Single exit path for crypto: cancel open sells, confirm cancels, market-sell qty_available, clear stop/tp keys.
 * Idempotent per symbol via in-process + DB lock.
 */
export async function exitCryptoPosition(
  symbol: string,
  reason: CryptoExitReason,
): Promise<ExitCryptoPositionResult> {
  const acquired = await acquireExitLock(symbol);
  if (!acquired) {
    return { exited: false, skippedReason: 'locked' };
  }

  try {
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
      if (outcome === 'failed') {
        await logGuardEvent('crypto_exit_cancel_fail', `Could not cancel ${o.id}`, {
          symbol,
          orderId: o.id,
          reason,
        });
        return { exited: false, skippedReason: 'cancel_failed' };
      }
    }

    const positions = await alpaca.positions();
    const pos = positions.find((p) => alpacaSymbolsEqual(p.symbol, symbol));
    const sellQty = pos ? positionQtyAvailable(pos) : 0;
    if (!(sellQty > 0)) {
      await clearCryptoExitSettings(symbol);
      return { exited: false, skippedReason: 'no_qty' };
    }

    await logExitReason(symbol, reason, `Market sell ${sellQty} (${reason})`);
    const order = await alpaca.placeOrder({
      symbol,
      qty: sellQty,
      side: 'sell',
      type: 'market',
      time_in_force: 'gtc',
    });
    await clearCryptoExitSettings(symbol);
    return { exited: true, orderId: order.id };
  } finally {
    await releaseExitLock(symbol);
  }
}
