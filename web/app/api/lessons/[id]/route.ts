import { NextRequest, NextResponse } from 'next/server';
import { dbRun, hasDb } from '@/lib/db';
import { ensureSchema } from '@/lib/migrate';

export const dynamic = 'force-dynamic';

/** Pauzeer of activeer een les (alleen status active/paused). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureSchema();
  const { status } = await req.json().catch(() => ({}));
  if (!['active', 'paused'].includes(status)) {
    return NextResponse.json({ error: 'status must be active or paused' }, { status: 400 });
  }
  if (!hasDb()) return NextResponse.json({ ok: true, demo: true });
  await dbRun('UPDATE lessons SET status = $2 WHERE id = $1', [params.id, status]);
  return NextResponse.json({ ok: true, status });
}
