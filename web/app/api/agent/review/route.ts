import { NextResponse } from 'next/server';
import { runWeeklyReview } from '@/lib/weekly-review';

export async function POST() {
  try {
    const result = await runWeeklyReview();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
