import { NextResponse } from 'next/server';
import { dbQuery, dbRun, initDb, hasDb } from '@/lib/db';

let memTradingEnabled = true;

export async function GET() {
  if (!hasDb()) return NextResponse.json({ tradingEnabled: memTradingEnabled });
  await initDb();
  const rows = await dbQuery<{ value: string }>(`SELECT value FROM settings WHERE key='trading_enabled'`);
  return NextResponse.json({ tradingEnabled: rows.length === 0 || rows[0].value === 'true' });
}

export async function POST(req: Request) {
  const { tradingEnabled } = await req.json();
  if (!hasDb()) { memTradingEnabled = !!tradingEnabled; return NextResponse.json({ ok: true }); }
  await initDb();
  await dbRun(
    `INSERT INTO settings (key, value) VALUES ('trading_enabled', $1)
     ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()`,
    [String(tradingEnabled)]
  );
  return NextResponse.json({ ok: true });
}
