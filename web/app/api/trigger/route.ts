import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { routine } = await req.json();
  const secret = process.env.CRON_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  const res = await fetch(`${appUrl}/api/cron`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${secret}` },
    body: JSON.stringify({ routine }),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
