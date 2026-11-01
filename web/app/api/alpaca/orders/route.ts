import { NextResponse } from 'next/server';
import { alpaca } from '@/lib/alpaca';
import {
  MANUAL_ALPACA_ORDER_POST_ALLOWED,
  manualAlpacaOrderPostBlockedReason,
} from '../../../../../src/security/manual-orders';

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

export async function POST() {
  if (!MANUAL_ALPACA_ORDER_POST_ALLOWED) {
    return NextResponse.json({ error: manualAlpacaOrderPostBlockedReason() }, { status: 403 });
  }
  return NextResponse.json({ error: 'Not implemented' }, { status: 501 });
}
