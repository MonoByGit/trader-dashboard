import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'momentum_session';

function sessionSecret(): string {
  return process.env.APP_PASSWORD || process.env.CRON_SECRET || 'dev-insecure';
}

export function authRequired(): boolean {
  return !!process.env.APP_PASSWORD;
}

export function createSessionToken(): string {
  const payload = `ok:${sessionSecret()}`;
  const sig = createHmac('sha256', sessionSecret()).update(payload).digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!authRequired()) return true;
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const [payload, sig] = decoded.split(':');
    if (!payload || !sig) return false;
    const expected = createHmac('sha256', sessionSecret()).update(payload).digest('hex');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b) && payload.startsWith('ok:');
  } catch {
    return false;
  }
}

export function verifyPassword(password: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return true;
  if (password.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(password), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function isAuthenticated(): Promise<boolean> {
  if (!authRequired()) return true;
  const jar = await cookies();
  return verifySessionToken(jar.get(COOKIE_NAME)?.value);
}

export { COOKIE_NAME };
