import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { setEmergencyStop } from '@/lib/guards/service';

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { who } = await req.json().catch(() => ({}));
  const actor = typeof who === 'string' && who ? who : 'Dashboard';

  await setEmergencyStop(false, actor);

  return NextResponse.json({
    ok: true,
    emergencyStop: false,
    note: 'Routines may run again. Re-enable trading separately if desired.',
  });
}
