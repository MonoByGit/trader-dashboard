import { NextResponse } from 'next/server';
import { dbQuery, hasDb } from '@/lib/db';
import { ensureSchema } from '@/lib/migrate';

export const dynamic = 'force-dynamic';

type LessonRow = {
  id: string; title: string; why: string | null; description: string | null; category: string | null;
  status: string; hits: number; pnl_impact: number | null; confidence: number | null;
  created_at: string; last_applied_at: string | null;
};

export async function GET() {
  await ensureSchema();
  if (!hasDb()) {
    return NextResponse.json({ lessons: [] });
  }
  const rows = await dbQuery<LessonRow>('SELECT * FROM lessons ORDER BY created_at DESC LIMIT 100');
  const apps = await dbQuery<{ lesson_id: string; symbol: string; pnl_impact: number | null; created_at: string }>(
    `SELECT lesson_id, symbol, pnl_impact, created_at FROM lesson_applications ORDER BY created_at DESC LIMIT 200`,
  );
  return NextResponse.json({
    lessons: rows.map((l) => ({
      id: l.id,
      title: l.title,
      description: l.description || l.why || '',
      category: l.category || 'algemeen',
      status: l.status === 'active' ? 'active' : l.status === 'paused' ? 'paused' : l.status,
      source: 'agent',
      hits: l.hits ?? 0,
      pnlImpact: l.pnl_impact ?? 0,
      pnlImpactSaved: (l.pnl_impact ?? 0) >= 0,
      confidence: l.confidence ?? 0.5,
      createdAt: l.created_at,
      lastAppliedAt: l.last_applied_at,
      trigger: {
        human: l.description || l.why || l.title,
        code: 'approved_lesson_gate',
        gateLabel: l.title.split(' ').slice(0, 2).join(' '),
      },
      relatedTrades: apps
        .filter((a) => a.lesson_id === l.id && a.pnl_impact != null)
        .slice(0, 5)
        .map((a, i) => ({
          id: `lt-${i}`,
          symbol: a.symbol,
          date: a.created_at.slice(0, 10),
          pnl: a.pnl_impact ?? 0,
        })),
    })),
  });
}
