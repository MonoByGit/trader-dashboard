import { NextRequest, NextResponse } from 'next/server';
import { getThread, patchThread } from '@/lib/threads';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { thread, messages } = await getThread(params.id);
  if (!thread) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ thread, messages });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const thread = await patchThread(params.id, {
    status: body.status,
    turn: body.turn,
    assignee: body.assignee,
    dueDate: body.dueDate,
    priority: body.priority,
    read: body.read,
  });
  if (!thread) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ thread });
}
