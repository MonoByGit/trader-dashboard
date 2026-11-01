import { NextResponse } from 'next/server';
import { backfillSnapshotsFromAlpaca, listSnapshots, writeDailySnapshot } from '@/lib/snapshots';
import { requireCronAuth } from '@/lib/cron-auth';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') ?? '400', 10);
  const rows = await listSnapshots(limit);
  return NextResponse.json(rows);
}

/** Backfill idempotent per date — Bearer CRON_SECRET. */
export async function POST(req: Request) {
  if (!requireCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  if (body.action === 'today' || body.date) {
    const snap = await writeDailySnapshot(body.date);
    return NextResponse.json(snap);
  }
  const result = await backfillSnapshotsFromAlpaca({
    start: body.start,
    end: body.end,
  });
  return NextResponse.json(result);
}
