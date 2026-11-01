import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  createDraftStrategyVersion,
  listStrategyVersions,
  ensureActiveStrategyVersion,
} from '@/lib/strategy-versions';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [versions, active] = await Promise.all([
    listStrategyVersions(),
    ensureActiveStrategyVersion(),
  ]);
  return NextResponse.json({ versions, activeId: active.id });
}

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const draft = await createDraftStrategyVersion({
      baseVersionId: body.baseVersionId,
      rulesPatch: body.rulesPatch,
      notes: body.notes,
      versionLabel: body.versionLabel,
    });
    return NextResponse.json(draft, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Draft aanmaken mislukt';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
