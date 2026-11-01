import { NextResponse } from 'next/server';
import { authEnabled, createSessionCookieValue, sessionCookieOptions, SESSION_COOKIE, verifyPassword } from '@/lib/auth';

export async function POST(req: Request) {
  if (!authEnabled()) {
    return NextResponse.json({ ok: true, authDisabled: true });
  }
  const { password } = await req.json().catch(() => ({ password: '' }));
  if (!(await verifyPassword(typeof password === 'string' ? password : ''))) {
    return NextResponse.json({ error: 'Onjuist wachtwoord' }, { status: 401 });
  }
  const value = await createSessionCookieValue();
  if (!value) {
    return NextResponse.json({ error: 'Sessie kon niet worden aangemaakt' }, { status: 500 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, value, sessionCookieOptions());
  return res;
}
