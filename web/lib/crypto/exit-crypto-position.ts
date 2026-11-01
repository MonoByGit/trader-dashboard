import { dbRun, hasDb } from '@/lib/db';
import { ensureSchema } from '@/lib/migrate';
import { awaitOrderFilled, awaitStopOrderCanceled } from '../../../src/crypto/cancel-stop-order';
import { cryptoStopLookupKeys } from '../../../src/crypto/stop-storage-key';
import { cryptoTpLookupKeys } from '../../../src/crypto/exit-storage-key';
import { buildAlpacaClientOrderId } from '../../../src/alpaca/client-order-id';
import { positionQtyAvailable } from '../../../src/crypto/buy-fill-qty';
import { alpacaPositionSymbol, alpacaSymbolsEqual } from '../../../src/alpaca/symbol-path';
import { alpaca } from '@/lib/alpaca';
import { logGuardEvent } from '@/lib/guards/service';
import { foreignQtyForSymbol } from '@/lib/momentum2/ownership';
import { isForeignStrategyOrder, m1CloseQty } from '../../../src/trading/strategy-tags';
import { acquireExitLock, releaseExitLock, verifyExitLockOwner } from './exit-lock';

export type CryptoExitReason = 'software_stop' | 'take_profit' | 'manual_close' | 'emergency_flatten' | (string & {});

export type ExitCryptoPositionMode = 'market_sell' | 'close_position';

export type ExitCryptoPositionResult = {
  exited: boolean;
  orderId?: string;
  skippedReason?: 'locked' | 'lock_lost' | 'no_qty' | 'qty_reserved' | 'broker_filled' | 'cancel_failed' | 'cancel_timeout';
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

async function awaitPositionFlat(
  symbol: string,
  options?: { attempts?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> },
): Promise<boolean> {
  const attempts = options?.attempts ?? 12;
  const delayMs = options?.delayMs ?? 250;
  const sleep = options?.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  for (let i = 0; i < attempts; i++) {
    const positions = await alpaca.positions();
    const pos = positions.find((p) => alpacaSymbolsEqual(p.symbol, symbol));
    if (!pos || parseFloat(pos.qty) === 0) return true;
    if (i < attempts - 1) await sleep(delayMs);
  }
  return false;
}

async function abortIfLockLost(
  symbol: string,
  owner: string,
  reason: CryptoExitReason,
): Promise<ExitCryptoPositionResult | null> {
  const stillOwner = await verifyExitLockOwner(symbol, owner);
  if (stillOwner) return null;
  await logGuardEvent('crypto_exit_lock_lost', 'Exit lock lost before sell', { symbol, reason });
  return { exited: false, skippedReason: 'lock_lost' };
}

async function cancelOpenSellOrders(symbol: string, reason: CryptoExitReason): Promise<ExitCryptoPositionResult | null> {
  const open = await alpaca.openOrders(200);
  const sellOrders = open.filter(
    (o) =>
      o.side === 'sell' &&
      alpacaSymbolsEqual(o.symbol, symbol) &&
      !isForeignStrategyOrder(o.client_order_id),
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
    const positionQty = pos ? parseFloat(pos.qty) : 0;
    if (!(positionQty > 0)) {
      await clearCryptoExitSettings(symbol);
      return { exited: false, skippedReason: 'no_qty' };
    }
    const foreign = await foreignQtyForSymbol(symbol);
    const m1Qty = m1CloseQty(positionQty, foreign);
    if (!(m1Qty > 0)) {
      await clearCryptoExitSettings(symbol);
      return { exited: false, skippedReason: 'no_qty' };
    }
    const sellQty = Math.min(positionQtyAvailable(pos!), m1Qty);
    if (!(sellQty > 0)) {
      // M1 bezit nog stukken, maar een order van een andere sleeve houdt ze vast: settings NIET wissen
      await logGuardEvent('crypto_exit_qty_reserved', `M1 owns ${m1Qty} ${symbol} but none available`, {
        symbol,
        reason,
        positionQty,
        m1Qty,
      });
      return { exited: false, skippedReason: 'qty_reserved' };
    }

    if (mode === 'close_position' && sellQty >= positionQty - 1e-9) {
      const lockBlock = await abortIfLockLost(symbol, owner, reason);
      if (lockBlock) return lockBlock;
      await logExitReason(symbol, reason, `Close position ${sellQty} (${reason})`);
      await alpaca.closePosition(alpacaPositionSymbol(symbol));
      const flat = await awaitPositionFlat(symbol);
      if (flat) {
        await clearCryptoExitSettings(symbol);
      } else {
        await logGuardEvent('crypto_exit_sell_unfilled', 'Position still open after close request', {
          symbol,
          reason,
          mode,
        });
      }
      return { exited: true };
    }

    const lockBlock = await abortIfLockLost(symbol, owner, reason);
    if (lockBlock) return lockBlock;

    await logExitReason(symbol, reason, `Market sell ${sellQty} (${reason})`);
    const clientOrderId = buildAlpacaClientOrderId({
      routine: 'crypto-exit',
      runId: owner.replace(/-/g, '').slice(0, 12),
      symbol: alpacaPositionSymbol(symbol),
      side: 'sell',
    });
    const order = await alpaca.placeOrder({
      symbol,
      qty: sellQty,
      side: 'sell',
      type: 'market',
      time_in_force: 'gtc',
      client_order_id: clientOrderId,
    });
    const filled = await awaitOrderFilled(order.id, (id) => alpaca.getOrder(id));
    if (filled) {
      await clearCryptoExitSettings(symbol);
    } else {
      await logGuardEvent('crypto_exit_sell_unfilled', `Sell order ${order.id} not filled in time`, {
        symbol,
        orderId: order.id,
        reason,
      });
    }
    return { exited: true, orderId: order.id };
  } finally {
    await releaseExitLock(symbol, owner);
  }
}
