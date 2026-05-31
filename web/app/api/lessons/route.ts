import { NextResponse } from 'next/server';
import { dbQuery, hasDb } from '@/lib/db';
import { ensureSchema } from '@/lib/migrate';
import { MOCK } from '@/lib/mock';

export const dynamic = 'force-dynamic';

type LessonRow = {
  id: string; title: string; why: string | null; description: string | null; category: string | null;
  status: string; hits: number; pnl_impact: number | null; confidence: number | null;
  created_at: string; last_applied_at: string | null;
};

export async function GET() {
  await ensureSchema();
  if (hasDb()) {
    const rows = await dbQuery<LessonRow>('SELECT * FROM lessons ORDER BY created_at DESC LIMIT 100');
    if (rows.length > 0) {
      return NextResponse.json({
        lessons: rows.map((l) => ({
          id: l.id,
          title: l.title,
          description: l.description || l.why || '',
          category: l.category || 'algemeen',
          status: l.status === 'active' ? 'active' : l.status === 'paused' ? 'paused' : l.status,
          hits: l.hits ?? 0,
          pnlImpact: l.pnl_impact ?? 0,
          confidence: l.confidence ?? null,
          createdAt: l.created_at,
          lastAppliedAt: l.last_applied_at,
        })),
      });
    }
  }
  // Fallback: demo-lessen zodat de UI nooit leeg oogt zonder database.
  return NextResponse.json({ lessons: MOCK.lessons, demo: true });
}
