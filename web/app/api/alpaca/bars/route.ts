import { NextResponse } from 'next/server';
import { alpaca } from '@/lib/alpaca';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbols = (searchParams.get('symbols') ?? 'SPY,QQQ,XLK,XLI,XLY').split(',');
    const timeframe = searchParams.get('timeframe') ?? '1Day';
    const limit = parseInt(searchParams.get('limit') ?? '30');
    const data = await alpaca.bars(symbols, timeframe, limit);
    return NextResponse.json(data.bars);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
