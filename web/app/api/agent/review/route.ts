import { NextResponse } from 'next/server';
import { alpaca } from '@/lib/alpaca';
import { claudeText, MODELS } from '@/lib/ai';

export async function POST() {
  try {
    const [account, orders] = await Promise.all([
      alpaca.account(),
      alpaca.orders(200),
    ]);

    const equity = parseFloat(account.equity);
    const filledOrders = orders.filter(o => o.status === 'filled');

    const system = `You are Momentum-1. Write a weekly strategy review in Dutch for a momentum ETF trading strategy.
Be analytical. Identify what worked, what didn't, and suggest specific adjustments.
Max 4 paragraphs.`;

    const userPrompt = `Weekly review — ${new Date().toLocaleDateString('nl-NL')}
Current equity: $${equity.toFixed(2)}
Total filled orders this week: ${filledOrders.length}
Symbols traded: ${Array.from(new Set(filledOrders.map(o => o.symbol))).join(', ') || 'none'}
Open positions: ${(await alpaca.positions()).map(p => p.symbol).join(', ') || 'none'}

Write a comprehensive weekly strategy review with lessons learned and adjustments for next week.`;

    const review = await claudeText(MODELS.opus, system, userPrompt, 2048);

    return NextResponse.json({
      date: new Date().toISOString().split('T')[0],
      generatedAt: new Date().toISOString(),
      equity,
      review,
      ordersThisWeek: filledOrders.length,
      symbolsTraded: Array.from(new Set(filledOrders.map(o => o.symbol))),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
