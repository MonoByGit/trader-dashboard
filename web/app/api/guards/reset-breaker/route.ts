import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { resetCircuitBreaker } from '@/lib/guards/service';

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { who } = await req.json().catch(() => ({}));
  const actor = typeof who === 'string' && who ? who : 'Dashboard';
  await resetCircuitBreaker(actor);
  return NextResponse.json({ ok: true });
}
