import { NextResponse } from 'next/server';
import { dbQuery, dbRun, initDb, hasDb } from '@/lib/db';
import { claudeText, MODELS } from '@/lib/ai';
import { alpaca } from '@/lib/alpaca';
import strategy from '@/strategy.json';

const memThreads: Record<string, unknown[]> = {};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const threadId = searchParams.get('threadId');

  if (!hasDb()) {
    return NextResponse.json(threadId ? (memThreads[threadId] ?? []) : []);
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
${positions.length > 0 ? `Open posities: ${positions.map(p => `${p.symbol} (${p.unrealized_pl >= '0' ? '+' : ''}$${parseFloat(p.unrealized_pl).toFixed(0)})`).join(', ')}.` : 'Geen open posities.'}
Je bent in gesprek met Dusty, de eigenaar en leerling. Schrijf in het Nederlands. Wees analytisch, direct en to the point.
Deel inzichten, patronen en leermomenten. Stel proactief vragen terug als dat relevant is.`;

  const reply = await claudeText(MODELS.sonnet, system, message, 1024);

  const userMsg = { id: `msg-${Date.now()}-u`, threadId, from: 'user', body: message, createdAt: new Date().toISOString() };
  const agentMsg = { id: `msg-${Date.now()}-a`, threadId, from: 'agent', body: reply, createdAt: new Date().toISOString() };

  if (!hasDb()) {
    if (!memThreads[threadId]) memThreads[threadId] = [];
    memThreads[threadId].push(userMsg, agentMsg);
    return NextResponse.json({ reply, agentMsg });
  }

  await initDb();
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
