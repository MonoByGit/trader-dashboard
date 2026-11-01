import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getStrategyVersionById } from '@/lib/strategy-versions';
import { startStrategyComparison, getStrategyComparison } from '@/lib/strategy-comparison';
import { DEFAULT_BACKTEST_PARAMS } from '@/lib/backtest-runner';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const draft = await getStrategyVersionById(params.id);
  if (!draft) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const rows = await import('@/lib/db').then(async ({ dbQuery, hasDb }) => {
    if (!hasDb()) return [];
    return dbQuery<{ id: string }>(
      `SELECT id FROM strategy_comparisons WHERE draft_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [params.id],
    );
  });
  const cmpId = rows[0]?.id;
  if (!cmpId) return NextResponse.json({ comparison: null });
  const comparison = await getStrategyComparison(cmpId);
  return NextResponse.json({ comparison });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const end = body.periodEnd ?? new Date().toISOString().slice(0, 10);
    const startDate = new Date(end);
    startDate.setFullYear(startDate.getFullYear() - 1);
    const periodStart = body.periodStart ?? startDate.toISOString().slice(0, 10);
    const periodEnd = body.periodEnd ?? end;

    const comparison = await startStrategyComparison({
      draftId: params.id,
      periodStart,
      periodEnd,
      params: { ...DEFAULT_BACKTEST_PARAMS, ...body.params },
    });
    return NextResponse.json(comparison, { status: 202 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Vergelijking starten mislukt';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
