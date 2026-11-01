import { NextResponse } from 'next/server';
import { authRequired, createSessionToken, verifyPassword, COOKIE_NAME } from '@/lib/auth';

export async function POST(req: Request) {
  if (!authRequired()) {
    return NextResponse.json({ ok: true, authDisabled: true });
  }
  const { password } = await req.json();
  if (!verifyPassword(String(password ?? ''))) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, createSessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
  });
  return res;
}
