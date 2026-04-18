import { NextResponse } from 'next/server';
import { dbQuery, dbRun, initDb, hasDb } from '@/lib/db';
import { anthropic, MODELS } from '@/lib/ai';
import { alpaca } from '@/lib/alpaca';
import strategy from '@/strategy.json';

const memThreads: Record<string, Array<{ from_role: string; body: string }>> = {};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const threadId = searchParams.get('threadId');

  if (!hasDb()) {
    if (threadId) return NextResponse.json(memThreads[threadId] ?? []);
    return NextResponse.json([]);
  }

  await initDb();
  const rows = threadId
    ? await dbQuery(`SELECT * FROM conversations WHERE thread_id=$1 ORDER BY created_at ASC`, [threadId])
    : await dbQuery(`SELECT * FROM threads ORDER BY last_at DESC LIMIT 50`);
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const { threadId, threadTitle, message } = await req.json();

  const [account, positions] = await Promise.all([
    alpaca.account().catch(() => null),
    alpaca.positions().catch(() => []),
  ]);

  const system = `Je bent Momentum-1, een autonome trading agent die US ETFs verhandelt op Alpaca paper trading.
Strategie: ${strategy.name}. Symbolen: ${strategy.symbols.join(', ')}.
${account ? `Portfolio: $${parseFloat(account.equity).toFixed(0)} equity, $${parseFloat(account.cash).toFixed(0)} cash.` : ''}
${positions.length > 0 ? `Open posities: ${positions.map(p => `${p.symbol} (${parseFloat(p.unrealized_pl) >= 0 ? '+' : ''}$${parseFloat(p.unrealized_pl).toFixed(0)})`).join(', ')}.` : 'Geen open posities.'}
Je bent in gesprek met Dusty, de eigenaar en leerling. Schrijf in het Nederlands. Wees analytisch, direct en to the point.
Deel inzichten, patronen en leermomenten. Stel proactief vragen terug als dat relevant is.`;

  // Fetch thread history for multi-turn context
  let history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  if (hasDb()) {
    await initDb();
    const rows = await dbQuery<{ from_role: string; body: string }>(
      `SELECT from_role, body FROM conversations WHERE thread_id=$1 ORDER BY created_at ASC LIMIT 20`,
      [threadId]
    );
    history = rows.map(r => ({ role: r.from_role === 'user' ? 'user' : 'assistant', content: r.body }));
  } else if (memThreads[threadId]) {
    history = memThreads[threadId].map(r => ({ role: r.from_role === 'user' ? 'user' : 'assistant', content: r.body }));
  }

  const msg = await anthropic.messages.create({
    model: MODELS.sonnet,
    max_tokens: 1024,
    system,
    messages: [...history, { role: 'user', content: message }],
  });
  const reply = msg.content[0].type === 'text' ? msg.content[0].text : '';

  const now = new Date().toISOString();
  const userMsg = { id: `msg-${Date.now()}-u`, threadId, from: 'user', body: message, createdAt: now };
  const agentMsg = { id: `msg-${Date.now()}-a`, threadId, from: 'agent', body: reply, createdAt: now };

  if (!hasDb()) {
    if (!memThreads[threadId]) memThreads[threadId] = [];
    memThreads[threadId].push({ from_role: 'user', body: message }, { from_role: 'agent', body: reply });
    return NextResponse.json({ reply, agentMsg });
  }

  await dbRun(
    `INSERT INTO threads (id, title, kind, status, last_at) VALUES ($1,$2,'user_initiated','open',NOW())
     ON CONFLICT (id) DO UPDATE SET last_at=NOW()`,
    [threadId, threadTitle ?? 'Gesprek']
  );
  await dbRun(
    `INSERT INTO conversations (id, thread_id, from_role, body) VALUES ($1,$2,$3,$4),($5,$6,$7,$8)`,
    [userMsg.id, threadId, 'user', message, agentMsg.id, threadId, 'agent', reply]
  );
  return NextResponse.json({ reply, agentMsg });
}
