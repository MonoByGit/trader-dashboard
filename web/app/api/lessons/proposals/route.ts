import { NextResponse } from 'next/server';
import { dbQuery, hasDb } from '@/lib/db';
import { ensureSchema } from '@/lib/migrate';
import { MOCK } from '@/lib/mock';

export const dynamic = 'force-dynamic';

type ProposalRow = {
  id: string; title: string; description: string | null; category: string | null; status: string;
  confidence: number | null; related_trades: unknown; rationale: string | null; proposed_at: string;
};

export async function GET() {
  await ensureSchema();
  if (hasDb()) {
    const rows = await dbQuery<ProposalRow>(
      "SELECT * FROM lesson_proposals WHERE status IN ('proposed','seen') ORDER BY proposed_at DESC LIMIT 50",
    );
    return NextResponse.json({
      proposals: rows.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description || '',
        category: p.category || 'algemeen',
        status: p.status,
        confidence: p.confidence ?? null,
        relatedTrades: Array.isArray(p.related_trades) ? p.related_trades : [],
        rationale: p.rationale || '',
        proposedAt: p.proposed_at,
      })),
    });
  }
  return NextResponse.json({ proposals: MOCK.lessonProposals, demo: true });
}
