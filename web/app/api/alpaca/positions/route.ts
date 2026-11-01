import { NextResponse } from 'next/server';
import { closePositionAfterCancelingOrders } from '@/lib/alpaca-position-close';
import { alpaca } from '@/lib/alpaca';

export async function GET() {
  try {
    const positions = await alpaca.positions();
    return NextResponse.json(positions.map(p => ({
      symbol: p.symbol,
      qty: parseFloat(p.qty),
      avgEntryPrice: parseFloat(p.avg_entry_price),
      currentPrice: parseFloat(p.current_price),
      marketValue: parseFloat(p.market_value),
      costBasis: parseFloat(p.cost_basis),
      unrealizedPnl: parseFloat(p.unrealized_pl),
      unrealizedPnlPct: parseFloat(p.unrealized_plpc) * 100,
      side: p.side,
      changeToday: parseFloat(p.change_today),
    })));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { symbol } = await req.json();
    const result = await closePositionAfterCancelingOrders(String(symbol ?? ''));
    if (result && typeof result === 'object' && 'alreadyClosed' in result) {
      return NextResponse.json(result, { status: 409 });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
