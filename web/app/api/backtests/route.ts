import { NextResponse } from 'next/server';
import { toTradingDateString } from '../../../../src/dates/trading-date';
import { listBacktestRuns } from '@/lib/backtests';
import { DEFAULT_BACKTEST_PARAMS, startBacktestRun } from '@/lib/backtest-runner';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') ?? '50', 10);
  const runs = await listBacktestRuns(limit);
  return NextResponse.json(runs);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const periodStart = body.periodStart ?? body.start;
    const periodEnd = body.periodEnd ?? body.end;
    if (!periodStart || !periodEnd) {
      return NextResponse.json({ error: 'periodStart en periodEnd zijn verplicht' }, { status: 400 });
    }

    const assetClass = body.assetClass === 'crypto' ? 'crypto' : 'etf';
    const barMode =
      body.params?.barMode === 'hourly' || body.barMode === 'hourly' ? 'hourly' : 'daily';

    const run = await startBacktestRun({
      periodStart: toTradingDateString(periodStart),
      periodEnd: toTradingDateString(periodEnd),
      strategyVersion: body.strategyVersion,
      strategyVersionId: body.strategyVersionId ?? body.params?.strategyVersionId,
      assetClass,
      params: {
        ...DEFAULT_BACKTEST_PARAMS,
        ...body.params,
        barMode,
        assetClass,
      },
    });

    return NextResponse.json(run, { status: 202 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Backtest start mislukt';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
