import { NextResponse } from 'next/server';
import { dbQuery, hasDb } from '@/lib/db';
import { ensureSchema } from '@/lib/migrate';
import { listRecentRuns, listRunsForTradingDate } from '@/lib/routine-runs';
import { tradingDateEt } from '@scheduler/decide';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  const limit = parseInt(searchParams.get('limit') ?? '100', 10);
  const assetClass = searchParams.get('asset_class');

  if (assetClass && hasDb()) {
    await ensureSchema();
    const params: unknown[] = [limit];
    let where = ' WHERE asset_class = $2';
    params.push(assetClass);
    if (date) {
      where += ' AND trading_date = $3::date';
      params.push(date);
    }
    const rows = await dbQuery(
      `SELECT id, routine, trading_date::text AS trading_date, started_at, finished_at, status, skip_reason, duration_ms, error_message, asset_class
       FROM routine_runs${where} ORDER BY started_at DESC LIMIT $1`,
      params,
    );
    return NextResponse.json(rows);
  }

  if (date) {
    return NextResponse.json(await listRunsForTradingDate(date));
  }
  const today = tradingDateEt(Date.now());
  const rows = await listRecentRuns(limit);
  return NextResponse.json({ today, runs: rows });
}
