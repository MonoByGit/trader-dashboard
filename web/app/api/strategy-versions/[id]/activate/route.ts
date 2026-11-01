import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { activateStrategyVersion } from '@/lib/strategy-versions';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const row = await activateStrategyVersion(params.id);
    return NextResponse.json({ ok: true, version: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Activatie mislukt';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
