import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { isSoftStartEnabled, setSoftStartEnabled } from '@/lib/strategy-versions';
import { SOFT_START_DEFAULTS } from '@guards/index';

export async function GET() {
  const enabled = await isSoftStartEnabled();
  return NextResponse.json({ enabled, limits: SOFT_START_DEFAULTS });
}

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { enabled } = await req.json().catch(() => ({}));
  if (typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled (boolean) required' }, { status: 400 });
  }
  await setSoftStartEnabled(enabled);
  return NextResponse.json({ ok: true, enabled });
}
