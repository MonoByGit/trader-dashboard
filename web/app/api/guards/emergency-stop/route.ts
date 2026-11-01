import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { flattenAllPositions } from '@/lib/guards/alpaca-actions';
import { setEmergencyStop, setTradingEnabled } from '@/lib/guards/service';

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { who } = await req.json().catch(() => ({}));
  const actor = typeof who === 'string' && who ? who : 'Dashboard';

  await setEmergencyStop(true, actor);
  await setTradingEnabled(false);

  const { closed, errors } = await flattenAllPositions();

  return NextResponse.json({
    ok: true,
    emergencyStop: true,
    closed,
    errors,
  });
}
