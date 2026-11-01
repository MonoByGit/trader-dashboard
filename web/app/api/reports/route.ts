import { NextResponse } from 'next/server';
import { listReports } from '@/lib/reports';
import { hasDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ reports: [] });
  }
  try {
    const reports = await listReports(60);
    return NextResponse.json({ reports });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
