import { dbQuery, dbRun, hasDb } from '@/lib/db';
import { ensureSchema } from '@/lib/migrate';
import { openOrderMatchesSymbol } from '../../../src/crypto/symbol-match';
import {
  cryptoStopLookupKeys,
  cryptoStopStorageKey,
  legacyCryptoStopStorageKeys,
} from '../../../src/crypto/stop-storage-key';
import {
  cryptoTpLookupKeys,
  cryptoTpStorageKey,
  legacyCryptoTpStorageKeys,
} from '../../../src/crypto/exit-storage-key';
import { resolveCryptoPositionSellQty } from '../../../src/crypto/buy-fill-qty';
import { brokerStopOrdersBlockSoftwareBackup } from '../../../src/crypto/stop-order-backup';
import { runSoftwareTakeProfitExit } from '../../../src/crypto/software-take-profit';
import { alpacaSymbolsEqual } from '../../../src/alpaca/symbol-path';
import { alpaca } from '@/lib/alpaca';
import { logGuardEvent } from '@/lib/guards/service';
import { exitCryptoPosition } from './exit-crypto-position';

type StopPayload = { stopPrice: number; qty: number };
type TpPayload = { takeProfitPrice: number; qty: number };

async function readStopAtKey(key: string): Promise<StopPayload | null> {
  const rows = await dbQuery<{ value: string }>(`SELECT value FROM settings WHERE key=$1`, [key]);
  if (!rows.length) return null;
  try {
    return JSON.parse(rows[0].value) as StopPayload;
  } catch {
    return null;
  }
}

async function readTpAtKey(key: string): Promise<TpPayload | null> {
  const rows = await dbQuery<{ value: string }>(`SELECT value FROM settings WHERE key=$1`, [key]);
  if (!rows.length) return null;
  try {
    return JSON.parse(rows[0].value) as TpPayload;
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

export async function saveCryptoTakeProfit(
  symbol: string,
  takeProfitPrice: number,
  qty: number,
): Promise<void> {
  if (!hasDb()) return;
  await ensureSchema();
  const key = cryptoTpStorageKey(symbol);
  const payload = JSON.stringify({ takeProfitPrice, qty });
  await dbRun(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
    [key, payload],
  );
  for (const legacyKey of legacyCryptoTpStorageKeys(symbol)) {
    await dbRun(`DELETE FROM settings WHERE key=$1`, [legacyKey]);
  }
}

export async function loadCryptoTakeProfit(
  symbol: string,
): Promise<TpPayload | null> {
  if (!hasDb()) return null;
  await ensureSchema();
  const keys = cryptoTpLookupKeys(symbol);
  const primary = keys[0];
  for (const key of keys) {
    const tp = await readTpAtKey(key);
    if (!tp) continue;
    if (key !== primary) {
      await dbRun(
        `INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
        [primary, JSON.stringify(tp)],
      );
      await dbRun(`DELETE FROM settings WHERE key=$1`, [key]);
    }
    return tp;
  }
  return null;
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

/** Place GTC stop-limit; Alpaca crypto has no brackets / OCO. */
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

function hasOpenStopLimitSell(
  open: Awaited<ReturnType<typeof alpaca.openOrders>>,
  symbol: string,
): boolean {
  return open.some(
    (o) =>
      openOrderMatchesSymbol(o, symbol) &&
      o.side === 'sell' &&
      (o.type === 'stop_limit' || o.type === 'stop'),
  );
}

/** Software take-profit only — single exit via exitCryptoPosition (no broker TP sell). */
export async function enforceSoftwareCryptoTakeProfit(
  symbol: string,
  lastPrice: number,
): Promise<{ triggered: boolean; orderId?: string }> {
  const tp = await loadCryptoTakeProfit(symbol);
  if (!tp) return { triggered: false };

  const open = await alpaca.openOrders();
  const stopLimitOpen = hasOpenStopLimitSell(open, symbol);

  const result = await runSoftwareTakeProfitExit({
    symbol,
    lastPrice,
    takeProfitPrice: tp.takeProfitPrice,
    openStopLimitSell: stopLimitOpen,
    logEvent: async (reason) => {
      await logGuardEvent('crypto_software_tp', reason, { symbol });
    },
    exit: async (sym, reason) => {
      const r = await exitCryptoPosition(sym, 'take_profit');
      void reason;
      return { orderId: r.orderId };
    },
  });
  return { triggered: result.triggered, orderId: result.orderId };
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

  const result = await exitCryptoPosition(symbol, 'software_stop');
  return {
    triggered: result.exited,
    orderId: result.orderId,
  };
}
