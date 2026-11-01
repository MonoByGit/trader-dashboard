import { NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/cron-auth';
import { runMomentum2 } from '@/lib/momentum2/run';

export const dynamic = 'force-dynamic';

/** POST { step: 'decide' | 'execute' } met Bearer CRON_SECRET. Doet niets tenzij MOMENTUM2_ENABLED=1. */
export async function POST(req: Request) {
  if (!requireCronAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { step } = (await req.json().catch(() => ({}))) as { step?: string };
  if (step !== 'decide' && step !== 'execute') {
    return NextResponse.json({ error: "step moet 'decide' of 'execute' zijn" }, { status: 400 });
  }
  try {
    return NextResponse.json(await runMomentum2(step));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
