import { NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/cron-auth';
import { runMomentum4 } from '@/lib/momentum4/run';

export const dynamic = 'force-dynamic';

/** POST { step: 'refresh' | 'decide' | 'execute', cik? } met Bearer CRON_SECRET. Uit tenzij MOMENTUM4_ENABLED=1; alleen schaduw. */
export async function POST(req: Request) {
  if (!requireCronAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { step?: string; cik?: string };
  if (body.step !== 'refresh' && body.step !== 'decide' && body.step !== 'execute') {
    return NextResponse.json({ error: "step moet 'refresh', 'decide' of 'execute' zijn" }, { status: 400 });
  }
  try {
    return NextResponse.json(await runMomentum4(body.step, body));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
