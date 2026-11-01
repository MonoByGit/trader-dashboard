import { classifySymbol } from '@/lib/asset-class';
import type { AlpacaOrder } from './alpaca';
import { alpaca } from './alpaca';
import { dbRun, hasDb } from './db';
import { ensureSchema } from './migrate';

export async function upsertAlpacaOrder(o: AlpacaOrder): Promise<void> {
  if (!hasDb()) return;
  await ensureSchema();
  const assetClass = classifySymbol(o.symbol);
  await dbRun(
    `INSERT INTO alpaca_orders (
      id, symbol, side, qty, filled_qty, type, status, limit_price, stop_price,
      filled_avg_price, submitted_at, filled_at, raw, asset_class, synced_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      filled_qty = EXCLUDED.filled_qty,
      filled_avg_price = EXCLUDED.filled_avg_price,
      filled_at = EXCLUDED.filled_at,
      raw = EXCLUDED.raw,
      asset_class = EXCLUDED.asset_class,
      synced_at = NOW()`,
    [
      o.id,
      o.symbol,
      o.side,
      parseFloat(o.qty) || null,
      parseFloat(o.filled_qty) || null,
      o.type,
      o.status,
      o.limit_price ? parseFloat(o.limit_price) : null,
      o.stop_price ? parseFloat(o.stop_price) : null,
      o.filled_avg_price ? parseFloat(o.filled_avg_price) : null,
      o.submitted_at ? new Date(o.submitted_at).toISOString() : null,
      o.filled_at ? new Date(o.filled_at).toISOString() : null,
      JSON.stringify(o),
      assetClass,
    ],
  );
}

export async function syncRecentOrders(limit = 200): Promise<number> {
  const orders = await alpaca.orders(limit);
  for (const o of orders) {
    await upsertAlpacaOrder(o);
  }
  return orders.length;
}
