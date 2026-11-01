import { NextResponse } from 'next/server';
import { dbQuery, hasDb } from '@/lib/db';
import { ensureSchema } from '@/lib/migrate';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') ?? '100', 10);
  const assetClass = searchParams.get('asset_class');
  if (!hasDb()) return NextResponse.json([]);
  await ensureSchema();
  const params: unknown[] = [limit];
  let where = '';
  if (assetClass === 'etf' || assetClass === 'crypto') {
    where = ' WHERE asset_class = $2';
    params.push(assetClass);
  }
  const rows = await dbQuery(
    `SELECT id, symbol, side, qty::float8 AS qty, filled_qty::float8 AS filled_qty, type, status,
      limit_price::float8 AS limit_price, stop_price::float8 AS stop_price,
      filled_avg_price::float8 AS filled_avg_price, submitted_at, filled_at, asset_class, synced_at
     FROM alpaca_orders${where} ORDER BY submitted_at DESC NULLS LAST LIMIT $1`,
    params,
  );
  return NextResponse.json(rows);
}
