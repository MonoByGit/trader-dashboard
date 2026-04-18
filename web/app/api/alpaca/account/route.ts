import { NextResponse } from 'next/server';
import { alpaca } from '@/lib/alpaca';

export async function GET() {
  try {
    const [account, clock] = await Promise.all([alpaca.account(), alpaca.clock()]);
    const equity = parseFloat(account.equity);
    const lastEquity = parseFloat(account.last_equity);
    return NextResponse.json({
      equity,
      cash: parseFloat(account.cash),
      buyingPower: parseFloat(account.buying_power),
      dayPnl: equity - lastEquity,
      dayPnlPct: (equity - lastEquity) / lastEquity,
      daytrades: account.daytrade_count,
      tradingBlocked: account.trading_blocked,
      marketOpen: clock.is_open,
      nextOpen: clock.next_open,
      nextClose: clock.next_close,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
