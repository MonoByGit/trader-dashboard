import { NextRequest, NextResponse } from 'next/server';
import { dbQuery, dbRun, hasDb } from '@/lib/db';
import { ensureSchema } from '@/lib/migrate';
import { captureLessonEvent } from '@/lib/openbrain';
import { patchThread, listThreads } from '@/lib/threads';

export const dynamic = 'force-dynamic';

type ProposalRow = {
  id: string; title: string; description: string | null; category: string | null;
  confidence: number | null; status: string;
};

// Goedkeuren / afwijzen / markeer-gezien voor een lesvoorstel.
// Goedkeuren schrijft echt naar de lessons-tabel en activeert de les als gate.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureSchema();
  const { action, notes } = await req.json().catch(() => ({ action: '' }));
  const id = params.id;

  if (!['approve', 'reject', 'seen'].includes(action)) {
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  }

  if (!hasDb()) {
    // Zonder database (lokale preview): geen persistentie, maar sluit wel de
    // bijbehorende draad zodat de flow op het bord compleet voelt.
    if (action !== 'seen') await closeAnchoredThread('lesson', id);
    return NextResponse.json({ ok: true, status: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'seen', demo: true });
  }

  const rows = await dbQuery<ProposalRow>('SELECT * FROM lesson_proposals WHERE id=$1', [id]);
  const p = rows[0];
  if (!p) return NextResponse.json({ error: 'not found' }, { status: 404 });

  if (action === 'seen') {
    await dbRun("UPDATE lesson_proposals SET status='seen' WHERE id=$1", [id]);
    return NextResponse.json({ ok: true, status: 'seen' });
  }

  if (action === 'reject') {
    await dbRun("UPDATE lesson_proposals SET status='rejected', reviewed_at=NOW(), reviewer='dusty', notes=$2 WHERE id=$1", [id, notes ?? null]);
    await captureLessonEvent(id, p.title, 'rejected', notes || '');
    await closeAnchoredThread('lesson', id);
    return NextResponse.json({ ok: true, status: 'rejected' });
  }

  // approve: maak/activeer de les en zet het voorstel op approved.
  const lessonId = `l_${Date.now()}`;
  await dbRun(
    `INSERT INTO lessons (id, title, why, description, category, status, hits, pnl_impact, confidence, created_at)
     VALUES ($1,$2,$3,$3,$4,'active',0,0,$5,NOW()) ON CONFLICT (id) DO NOTHING`,
    [lessonId, p.title, p.description ?? '', p.category ?? 'algemeen', p.confidence ?? null],
  );
  await dbRun("UPDATE lesson_proposals SET status='approved', reviewed_at=NOW(), reviewer='dusty', notes=$2 WHERE id=$1", [id, notes ?? null]);
  await captureLessonEvent(lessonId, p.title, 'approved', p.description || '');
  await closeAnchoredThread('lesson', id);

  return NextResponse.json({ ok: true, status: 'approved', lessonId });
}

// Sluit de bijbehorende goedkeuringsdraad als die bestaat.
async function closeAnchoredThread(anchorType: string, anchorId: string) {
  try {
    const all = await listThreads();
    const t = all.find((x) => x.anchorType === anchorType && x.anchorId === anchorId && x.status === 'open');
    if (t) await patchThread(t.id, { status: 'done', turn: 'none', read: true });
  } catch { /* niet kritisch */ }
}
