import { NextResponse } from 'next/server';
import { alpaca } from '@/lib/alpaca';
import { claudeText, MODELS } from '@/lib/ai';
import { dbQuery, initDb, hasDb } from '@/lib/db';

export async function GET() {
  if (!hasDb()) return NextResponse.json(null);
  try {
    await initDb();
    const rows = await dbQuery<{
      id: string;
      date: string;
      generated_at: string;
      kpis: { equityStart?: number; equityEnd?: number; closed?: number } | null;
      narrative: string | null;
    }>(
      `SELECT id, date, generated_at, kpis, narrative
       FROM agent_reports ORDER BY generated_at DESC LIMIT 1`
    );
    return NextResponse.json(rows[0] ?? null);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST() {
  try {
    const [account, positions, orders] = await Promise.all([
      alpaca.account(),
      alpaca.positions(),
      alpaca.orders(50),
    ]);

    const equity = parseFloat(account.equity);
    const lastEquity = parseFloat(account.last_equity);
    const dayPnl = equity - lastEquity;
    const dayPnlPct = (dayPnl / lastEquity) * 100;

    const todayOrders = orders.filter(o => {
      const d = o.filled_at ?? o.submitted_at;
      return d && new Date(d).toDateString() === new Date().toDateString();
    });

    const system = `You are Momentum, an autonomous trading agent. Write a concise, professional end-of-day trading report in Dutch.
Be direct and analytical. No fluff. 2-3 paragraphs max.
Focus on: what happened, why, key lessons, what to watch tomorrow.`;

    const userPrompt = `Today's trading summary:
Date: ${new Date().toLocaleDateString('nl-NL')}
Equity: $${lastEquity.toFixed(2)} → $${equity.toFixed(2)}
Day P&L: ${dayPnl >= 0 ? '+' : ''}$${dayPnl.toFixed(2)} (${dayPnlPct >= 0 ? '+' : ''}${dayPnlPct.toFixed(2)}%)
Open positions: ${positions.length} (${positions.map(p => `${p.symbol} ${parseFloat(p.unrealized_pl) >= 0 ? '+' : ''}$${parseFloat(p.unrealized_pl).toFixed(2)}`).join(', ') || 'none'})
Orders today: ${todayOrders.length} (${todayOrders.map(o => `${o.side.toUpperCase()} ${o.symbol} ${o.status}`).join(', ') || 'none'})

Write the EOD report narrative.`;

    const narrative = await claudeText(MODELS.sonnet, system, userPrompt, 1024);

    return NextResponse.json({
      date: new Date().toISOString().split('T')[0],
      generatedAt: new Date().toISOString(),
      kpis: {
        equityStart: lastEquity,
        equityEnd: equity,
        dayPnl,
        dayPnlPct,
        tradesToday: todayOrders.length,
        openPositions: positions.length,
      },
      narrative,
      positions: positions.map(p => ({
        symbol: p.symbol,
        unrealizedPnl: parseFloat(p.unrealized_pl),
        unrealizedPnlPct: parseFloat(p.unrealized_plpc) * 100,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
