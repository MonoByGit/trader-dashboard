import { NextResponse } from 'next/server';
import { authRequired, isAuthenticated } from '@/lib/auth';

export async function GET() {
  if (!authRequired()) {
    return NextResponse.json({ authenticated: true, authRequired: false });
  }
  const authenticated = await isAuthenticated();
  return NextResponse.json({ authenticated, authRequired: true });
}
