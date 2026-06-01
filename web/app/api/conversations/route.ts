import { NextRequest, NextResponse } from 'next/server';
import { listThreads, getThread, replyAsAgent } from '@/lib/threads';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const threadId = req.nextUrl.searchParams.get('threadId');
  if (threadId) {
    const { messages } = await getThread(threadId);
    return NextResponse.json({ messages });
  }
  const threads = await listThreads();
  return NextResponse.json({ threads });
}

export async function POST(req: NextRequest) {
  const { threadId, threadTitle, message, type } = await req.json();
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 });
  if (!threadId) return NextResponse.json({ error: 'threadId required' }, { status: 400 });

  const { reply, agentMsg } = await replyAsAgent({ threadId, threadTitle, message, type });
  return NextResponse.json({ reply, agentMsg });
}
