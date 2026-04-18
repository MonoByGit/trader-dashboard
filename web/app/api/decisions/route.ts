import { NextResponse } from 'next/server';
import { dbQuery, dbRun, initDb, hasDb } from '@/lib/db';

const memStore: unknown[] = [];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') ?? '100');

  if (!hasDb()) {
    return NextResponse.json(memStore.slice(-limit).reverse());
  }

  await initDb();
  const rows = await dbQuery(
    `SELECT id, ts, routine, symbol, decision, criteria, rationale, agent_note, confidence, order_id
     FROM decisions ORDER BY ts DESC LIMIT $1`,
    [limit]
  );
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { id, ts, routine, symbol, decision, criteria, rationale, agentNote, confidence, orderId } = body;

  if (!hasDb()) {
    memStore.push(body);
    return NextResponse.json({ ok: true });
  }

  await initDb();
  await dbRun(
    `INSERT INTO decisions (id, ts, routine, symbol, decision, criteria, rationale, agent_note, confidence, order_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (id) DO NOTHING`,
    [id, ts, routine, symbol, decision, JSON.stringify(criteria), rationale, agentNote, confidence, orderId ?? null]
  );
  return NextResponse.json({ ok: true });
}
