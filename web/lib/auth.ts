/** Sessie-cookie voor APP_PASSWORD-login (Edge + Node). */

export const SESSION_COOKIE = 'momentum_session';
const SESSION_DAYS = 30;

function secret(): string | null {
  const p = process.env.APP_PASSWORD?.trim();
  return p || null;
}

export function authEnabled(): boolean {
  return !!secret();
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
  const key = secret();
  if (!key) return null;
  const exp = Date.now() + SESSION_DAYS * 86400000;
  const payload = JSON.stringify({ exp });
  const payloadB64 = toBase64Url(new TextEncoder().encode(payload));
  const sig = await hmacSign(payloadB64, key);
  return `${payloadB64}.${sig}`;
}

export async function verifySessionCookieValue(token: string | undefined | null): Promise<boolean> {
  const key = secret();
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
