import { dbQuery, dbRun, hasDb } from '@/lib/db';
import { ensureSchema } from '@/lib/migrate';
import { openOrderMatchesSymbol } from '../../../src/crypto/symbol-match';
import { alpaca } from '@/lib/alpaca';
import { logGuardEvent } from '@/lib/guards/service';

const stopKey = (symbol: string) => `crypto_stop:${symbol}`;

export async function saveCryptoStop(symbol: string, stopPrice: number, qty: number): Promise<void> {
  if (!hasDb()) return;
  await ensureSchema();
  await dbRun(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
    [stopKey(symbol), JSON.stringify({ stopPrice, qty })],
  );
}

export async function loadCryptoStop(symbol: string): Promise<{ stopPrice: number; qty: number } | null> {
  if (!hasDb()) return null;
  await ensureSchema();
  const rows = await dbQuery<{ value: string }>(`SELECT value FROM settings WHERE key=$1`, [stopKey(symbol)]);
  if (!rows.length) return null;
  try {
    return JSON.parse(rows[0].value) as { stopPrice: number; qty: number };
  } catch {
    return null;
  }
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

/** Tick backup if price breaches stored stop. */
export async function enforceSoftwareCryptoStops(
  symbol: string,
  lastPrice: number,
): Promise<{ triggered: boolean; orderId?: string }> {
  const stop = await loadCryptoStop(symbol);
  if (!stop || lastPrice > stop.stopPrice) return { triggered: false };

  const open = await alpaca.openOrders();
  const hasStop = open.some(
    (o) =>
      openOrderMatchesSymbol(o, symbol) &&
      o.side === 'sell' &&
      (o.type === 'stop_limit' || o.type === 'stop'),
  );
  if (hasStop) return { triggered: false };

  await logGuardEvent('crypto_software_stop', `Price ${lastPrice} <= stop ${stop.stopPrice}`, { symbol });
  const order = await alpaca.placeOrder({
    symbol,
    qty: stop.qty,
    side: 'sell',
    type: 'market',
    time_in_force: 'gtc',
  });
  return { triggered: true, orderId: order.id };
}
