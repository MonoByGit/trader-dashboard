import { NextResponse } from 'next/server';
import { dbQuery, dbRun, initDb, hasDb } from '@/lib/db';
import { sendMessage, killSwitchMessage } from '@/lib/telegram';

let memTradingEnabled = true;

export async function GET() {
  if (!hasDb()) return NextResponse.json({ tradingEnabled: memTradingEnabled });
  await initDb();
  const rows = await dbQuery<{ value: string }>(`SELECT value FROM settings WHERE key='trading_enabled'`);
  return NextResponse.json({ tradingEnabled: rows.length === 0 || rows[0].value === 'true' });
}

export async function POST(req: Request) {
  const { tradingEnabled, who } = await req.json();
  const enabled = !!tradingEnabled;

  // Notify only on an actual state change.
  let previous = true;
  if (hasDb()) {
    await initDb();
    const rows = await dbQuery<{ value: string }>(`SELECT value FROM settings WHERE key='trading_enabled'`);
    previous = rows.length === 0 || rows[0].value === 'true';
  } else {
    previous = memTradingEnabled;
  }

  if (!hasDb()) {
    memTradingEnabled = enabled;
  } else {
    await dbRun(
      `INSERT INTO settings (key, value) VALUES ('trading_enabled', $1)
       ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()`,
      [String(enabled)]
    );
  }

  if (previous !== enabled) {
    await sendMessage(killSwitchMessage(enabled, typeof who === 'string' && who ? who : 'Dusty'));
  }
  return NextResponse.json({ ok: true });
}
