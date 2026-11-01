import { dbQuery, dbRun, hasDb } from '@/lib/db';
import { ensureSchema } from '@/lib/migrate';
import { openOrderMatchesSymbol } from '../../../src/crypto/symbol-match';
import {
  cryptoStopLookupKeys,
  cryptoStopStorageKey,
  legacyCryptoStopStorageKeys,
} from '../../../src/crypto/stop-storage-key';
import { positionQtyAvailable, resolveCryptoPositionSellQty } from '../../../src/crypto/buy-fill-qty';
import { awaitStopOrderCanceled } from '../../../src/crypto/cancel-stop-order';
import { brokerStopOrdersBlockSoftwareBackup } from '../../../src/crypto/stop-order-backup';
import { alpacaSymbolsEqual } from '../../../src/alpaca/symbol-path';
import { alpaca, AlpacaPosition } from '@/lib/alpaca';
import { logGuardEvent } from '@/lib/guards/service';

type StopPayload = { stopPrice: number; qty: number };

async function readStopAtKey(key: string): Promise<StopPayload | null> {
  const rows = await dbQuery<{ value: string }>(`SELECT value FROM settings WHERE key=$1`, [key]);
  if (!rows.length) return null;
  try {
    return JSON.parse(rows[0].value) as StopPayload;
  } catch {
    return null;
  }
}

export async function saveCryptoStop(symbol: string, stopPrice: number, qty: number): Promise<void> {
  if (!hasDb()) return;
  await ensureSchema();
  const key = cryptoStopStorageKey(symbol);
  const payload = JSON.stringify({ stopPrice, qty });
  await dbRun(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
    [key, payload],
  );
  for (const legacyKey of legacyCryptoStopStorageKeys(symbol)) {
    await dbRun(`DELETE FROM settings WHERE key=$1`, [legacyKey]);
  }
}

export async function loadCryptoStop(symbol: string): Promise<StopPayload | null> {
  if (!hasDb()) return null;
  await ensureSchema();
  const keys = cryptoStopLookupKeys(symbol);
  const primary = keys[0];
  for (const key of keys) {
    const stop = await readStopAtKey(key);
    if (!stop) continue;
    if (key !== primary) {
      await dbRun(
        `INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
        [primary, JSON.stringify(stop)],
      );
      await dbRun(`DELETE FROM settings WHERE key=$1`, [key]);
    }
    return stop;
  }
  return null;
}

/** Place GTC stop-limit; Alpaca crypto has no brackets. */
export async function placeCryptoStopLimit(
  symbol: string,
  qty: number,
  stopPrice: number,
): Promise<string | null> {
  const limit = +(stopPrice * 0.995).toFixed(2);
  const order = await alpaca.placeOrder({
    symbol,
    qty,
    side: 'sell',
    type: 'stop_limit',
    time_in_force: 'gtc',
    stop_price: stopPrice,
    limit_price: limit,
  });
  return order.id;
}

export type ProtectAfterBuyOptions = {
  poll?: { attempts?: number; delayMs?: number };
};

/** Poll buy fill / position and attach software + broker stops using qty_available (B-5). */
export async function protectCryptoPositionAfterBuy(
  symbol: string,
  buyOrderId: string,
  stopPrice: number,
  options?: ProtectAfterBuyOptions,
): Promise<{ qty: number; stopLimitOrderId: string | null }> {
  const qty = await resolveCryptoPositionSellQty(symbol, buyOrderId, {
    getOrder: (id) => alpaca.getOrder(id),
    positions: () => alpaca.positions(),
    symbolsEqual: alpacaSymbolsEqual,
    pollOptions: options?.poll,
  });
  await saveCryptoStop(symbol, stopPrice, qty);
  try {
    const stopLimitOrderId = await placeCryptoStopLimit(symbol, qty, stopPrice);
    return { qty, stopLimitOrderId };
  } catch (e) {
    await logGuardEvent('crypto_stop_limit_fail', String(e), { symbol, buyOrderId, qty });
    throw e;
  }
}

function positionQtyAvailableForSymbol(positions: AlpacaPosition[], symbol: string): number {
  const pos = positions.find((p) => alpacaSymbolsEqual(p.symbol, symbol));
  if (!pos) return 0;
  return positionQtyAvailable(pos);
}

/** Tick backup if price breaches stored stop (runs even when kill switch / guards block new entries). */
export async function enforceSoftwareCryptoStops(
  symbol: string,
  lastPrice: number,
): Promise<{ triggered: boolean; orderId?: string }> {
  const stop = await loadCryptoStop(symbol);
  if (!stop || lastPrice > stop.stopPrice) return { triggered: false };

  const open = await alpaca.openOrders();
  const symbolStops = open.filter(
    (o) =>
      openOrderMatchesSymbol(o, symbol) &&
      o.side === 'sell' &&
      (o.type === 'stop_limit' || o.type === 'stop'),
  );

  if (brokerStopOrdersBlockSoftwareBackup(symbolStops, lastPrice, stop.stopPrice)) {
    return { triggered: false };
  }

  for (const o of symbolStops) {
    const outcome = await awaitStopOrderCanceled(o.id, {
      getOrder: (id) => alpaca.getOrder(id),
      cancelOrder: (id) => alpaca.cancelOrder(id),
    });
    if (outcome === 'filled') {
      return { triggered: false };
    }
    if (outcome === 'failed') {
      await logGuardEvent('crypto_software_stop_cancel_fail', `Could not cancel ${o.id}`, {
        symbol,
        orderId: o.id,
      });
      return { triggered: false };
    }
  }

  const positions = await alpaca.positions();
  const sellQty = positionQtyAvailableForSymbol(positions, symbol);
  if (!(sellQty > 0)) return { triggered: false };

  await logGuardEvent('crypto_software_stop', `Price ${lastPrice} <= stop ${stop.stopPrice}`, { symbol });
  const order = await alpaca.placeOrder({
    symbol,
    qty: sellQty,
    side: 'sell',
    type: 'market',
    time_in_force: 'gtc',
  });
  return { triggered: true, orderId: order.id };
}
