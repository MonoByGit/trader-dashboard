import { dbQuery, dbRun, hasDb } from '@/lib/db';
import { ensureSchema } from '@/lib/migrate';

export interface ProtectiveStop {
  symbol: string;
  stopPrice: number;
  takeProfitPrice: number | null;
  entryPrice: number;
}

export async function getProtectiveStop(symbol: string): Promise<ProtectiveStop | null> {
  if (!hasDb()) return null;
  await ensureSchema();
  const rows = await dbQuery<{
    symbol: string;
    stop_price: string;
    take_profit_price: string | null;
    entry_price: string;
  }>(`SELECT symbol, stop_price, take_profit_price, entry_price FROM crypto_protective_stops WHERE symbol=$1`, [
    symbol,
  ]);
  if (!rows.length) return null;
  const r = rows[0];
  return {
    symbol: r.symbol,
    stopPrice: parseFloat(r.stop_price),
    takeProfitPrice: r.take_profit_price != null ? parseFloat(r.take_profit_price) : null,
    entryPrice: parseFloat(r.entry_price),
  };
}

export async function setProtectiveStop(stop: ProtectiveStop): Promise<void> {
  if (!hasDb()) return;
  await ensureSchema();
  await dbRun(
    `INSERT INTO crypto_protective_stops (symbol, stop_price, take_profit_price, entry_price, updated_at)
     VALUES ($1,$2,$3,$4,NOW())
     ON CONFLICT (symbol) DO UPDATE SET
       stop_price = EXCLUDED.stop_price,
       take_profit_price = EXCLUDED.take_profit_price,
       entry_price = EXCLUDED.entry_price,
       updated_at = NOW()`,
    [stop.symbol, stop.stopPrice, stop.takeProfitPrice, stop.entryPrice],
  );
}

export async function clearProtectiveStop(symbol: string): Promise<void> {
  if (!hasDb()) return;
  await ensureSchema();
  await dbRun(`DELETE FROM crypto_protective_stops WHERE symbol=$1`, [symbol]);
}
