/** Sessie-cookie voor app-login (Edge + Node). */

import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'momentum_session';
const SESSION_DAYS = 30;

/** HMAC signing key: SESSION_SECRET > APP_PASSWORD_SHA256 > APP_PASSWORD */
function sessionSigningSecret(): string | null {
  const session = process.env.SESSION_SECRET?.trim();
  if (session) return session;
  const sha = process.env.APP_PASSWORD_SHA256?.trim().toLowerCase();
  if (sha) return sha;
  const p = process.env.APP_PASSWORD?.trim();
  return p || null;
}

export function authEnabled(): boolean {
  const sha = process.env.APP_PASSWORD_SHA256?.trim();
  const p = process.env.APP_PASSWORD?.trim();
  return !!(sha || p);
}

/** Alias gebruikt door guard/session routes. */
export function authRequired(): boolean {
  return authEnabled();
}

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

async function sha256HexUtf8(password: string): Promise<string> {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(password));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** APP_PASSWORD_SHA256 wins over APP_PASSWORD when set. */
export async function verifyPassword(password: string): Promise<boolean> {
  const shaExpected = process.env.APP_PASSWORD_SHA256?.trim().toLowerCase();
  if (shaExpected) {
    const got = await sha256HexUtf8(password);
    const enc = new TextEncoder();
    return timingSafeEqual(enc.encode(got), enc.encode(shaExpected));
  }
  const expected = process.env.APP_PASSWORD?.trim();
  if (!expected) return false;
  const enc = new TextEncoder();
  return timingSafeEqual(enc.encode(password), enc.encode(expected));
}

async function hmacSign(message: string, key: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  return toBase64Url(new Uint8Array(sig));
}

async function hmacVerify(message: string, signatureB64: string, key: string): Promise<boolean> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  try {
    return await crypto.subtle.verify('HMAC', cryptoKey, new Uint8Array(fromBase64Url(signatureB64)), enc.encode(message));
  } catch {
    return false;
  }
}

export async function createSessionCookieValue(): Promise<string | null> {
  const key = sessionSigningSecret();
  if (!key) return null;
  const exp = Date.now() + SESSION_DAYS * 86400000;
  const payload = JSON.stringify({ exp });
  const payloadB64 = toBase64Url(new TextEncoder().encode(payload));
  const sig = await hmacSign(payloadB64, key);
  return `${payloadB64}.${sig}`;
}

export async function verifySessionCookieValue(token: string | undefined | null): Promise<boolean> {
  const key = sessionSigningSecret();
  if (!key || !token) return false;
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return false;
  if (!(await hmacVerify(payloadB64, sig, key))) return false;
  try {
    const json = new TextDecoder().decode(fromBase64Url(payloadB64));
    const { exp } = JSON.parse(json) as { exp?: number };
    return typeof exp === 'number' && exp > Date.now();
  } catch {
    return false;
  }
}

export async function isAuthenticated(): Promise<boolean> {
  if (!authEnabled()) return true;
  const jar = await cookies();
  return verifySessionCookieValue(jar.get(SESSION_COOKIE)?.value);
}

export function sessionCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 86400,
  };
}
