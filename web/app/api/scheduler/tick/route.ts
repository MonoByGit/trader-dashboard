import { NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/cron-auth';
import { runSchedulerTick } from '@/lib/scheduler-service';

export async function POST(req: Request) {
  if (!requireCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const nowMs = typeof body.nowMs === 'number' ? body.nowMs : Date.now();
    const result = await runSchedulerTick(nowMs);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.error('[scheduler-tick] failed', { message, stack });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
