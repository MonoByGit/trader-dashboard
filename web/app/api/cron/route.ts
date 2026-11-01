import { NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/cron-auth';
import { dispatchRoutine } from '@/lib/routine-dispatch';
import '@/lib/cron-routines';

export async function POST(req: Request) {
  if (!requireCronAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { routine } = await req.json();
  if (!routine || typeof routine !== 'string') {
    return NextResponse.json({ error: 'Missing routine' }, { status: 400 });
  }
  const known = ['premarket', 'market-open', 'midday', 'eod', 'weekly'];
  if (!known.includes(routine)) {
    return NextResponse.json({ error: 'Unknown routine' }, { status: 400 });
  }
  try {
    const result = await dispatchRoutine(routine);
    if ('error' in result) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
