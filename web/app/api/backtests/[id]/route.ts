import { NextResponse } from 'next/server';
import { getBacktestEquity, getBacktestRun, getBacktestTrades } from '@/lib/backtests';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const run = await getBacktestRun(id);
  if (!run) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 });

  const [trades, equity] = await Promise.all([
    getBacktestTrades(id),
    getBacktestEquity(id),
  ]);

  return NextResponse.json({ run, trades, equity });
}
