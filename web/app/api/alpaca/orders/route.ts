import { NextResponse } from 'next/server';
import { alpaca, AlpacaOrderRequest } from '@/lib/alpaca';

export async function GET() {
  try {
    const orders = await alpaca.orders(100);
    return NextResponse.json(orders.map(o => ({
      id: o.id,
      symbol: o.symbol,
      side: o.side,
      qty: parseFloat(o.qty),
      filledQty: parseFloat(o.filled_qty),
      type: o.type,
      status: o.status,
      submittedAt: o.submitted_at,
      filledAt: o.filled_at,
      filledAvgPrice: o.filled_avg_price ? parseFloat(o.filled_avg_price) : null,
      limitPrice: o.limit_price ? parseFloat(o.limit_price) : null,
      stopPrice: o.stop_price ? parseFloat(o.stop_price) : null,
    })));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body: AlpacaOrderRequest = await req.json();
    const order = await alpaca.placeOrder(body);
    return NextResponse.json(order);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
