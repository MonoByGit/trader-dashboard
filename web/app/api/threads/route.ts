import { NextRequest, NextResponse } from 'next/server';
import { getBoard, listThreads } from '@/lib/threads';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const view = req.nextUrl.searchParams.get('view');
  if (view === 'list') {
    return NextResponse.json({ threads: await listThreads() });
  }
  return NextResponse.json(await getBoard());
}
