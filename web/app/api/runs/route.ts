import { NextResponse } from 'next/server';
import { listRecentRuns, listRunsForTradingDate } from '@/lib/routine-runs';
import { tradingDateEt } from '@scheduler/decide';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  const limit = parseInt(searchParams.get('limit') ?? '100', 10);
  if (date) {
    return NextResponse.json(await listRunsForTradingDate(date));
  }
  const today = tradingDateEt(Date.now());
  const rows = await listRecentRuns(limit);
  return NextResponse.json({ today, runs: rows });
}
