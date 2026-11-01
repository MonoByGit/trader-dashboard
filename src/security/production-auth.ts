import { timingSafeEqual } from 'node:crypto';

/** Production security: fail closed when required secrets are missing. */

export function listMissingProductionAuthEnv(): string[] {
  if (process.env.NODE_ENV !== 'production') return [];
  const missing: string[] = [];
  if (!process.env.CRON_SECRET?.trim()) missing.push('CRON_SECRET');
  const hasAppPassword =
    !!process.env.APP_PASSWORD_SHA256?.trim() || !!process.env.APP_PASSWORD?.trim();
  if (!hasAppPassword) missing.push('APP_PASSWORD or APP_PASSWORD_SHA256');
  return missing;
}

export function assertProductionAuthEnv(): void {
  const missing = listMissingProductionAuthEnv();
  if (missing.length) {
    throw new Error(
      `Refusing to start: missing required auth env in production: ${missing.join(', ')}`,
    );
  }
}

/** Cron routes: in production always require CRON_SECRET; dev may omit it. */
export function cronAuthConfigured(): boolean {
  if (process.env.NODE_ENV === 'production') return !!process.env.CRON_SECRET?.trim();
  return !!process.env.CRON_SECRET?.trim();
}

export function verifyCronBearer(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return process.env.NODE_ENV !== 'production';
  }
  const expected = `Bearer ${secret}`;
  const got = authHeader ?? '';
  if (got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}
