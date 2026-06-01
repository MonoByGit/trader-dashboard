import { NextResponse } from 'next/server';
import { dbQuery, dbRun, initDb, hasDb } from '@/lib/db';
import { sendMessage, killSwitchMessage } from '@/lib/telegram';
import { openOrAppendThread } from '@/lib/threads';

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
    // Verankering: een kill-switch-wissel is een guard-gebeurtenis; log het op het bord.
    const day = new Date().toISOString().slice(0, 10);
    await openOrAppendThread({
      title: enabled ? 'Trading weer ingeschakeld' : 'Trading gestopt (kill switch)',
      type: 'gesprek', priority: enabled ? 'normaal' : 'hoog',
      anchorType: 'guard', anchorId: `killswitch-${day}`,
      summary: enabled ? 'Kill switch uit · trading actief' : 'Kill switch aan · geen nieuwe orders',
      tags: ['#killswitch', '#guard'],
      body: enabled
        ? 'De kill switch staat uit. Ik mag weer nieuwe orders inleggen volgens de strategie. Zijn er aandachtspunten voordat ik verderga?'
        : 'De kill switch is omgezet: ik leg geen nieuwe orders meer in. Bestaande posities en stops blijven actief. Laat je me weten wanneer ik weer mag handelen?',
    }).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
