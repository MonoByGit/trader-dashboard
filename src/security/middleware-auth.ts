/** Edge-safe checks for production misconfiguration (M-8). */

export function productionAppAuthConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!(env.APP_PASSWORD_SHA256?.trim() || env.APP_PASSWORD?.trim());
}

/** Paths that stay reachable when production has no app password configured. */
export function isMisconfigExemptPath(pathname: string): boolean {
  if (pathname === '/api/health') return true;
  if (pathname === '/login') return true;
  if (pathname.startsWith('/api/auth/')) return true;
  return false;
}

/** True when production has no app password and route must return 503. */
export function shouldBlockMisconfiguredProduction(
  pathname: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.NODE_ENV !== 'production') return false;
  if (productionAppAuthConfigured(env)) return false;
  if (isMisconfigExemptPath(pathname)) return false;
  return true;
}

/** Alleen deze vier schaduwroutes mogen via de tick-header langs de app-login (geen M4, geen andere routes). */
const MOMENTUM_TICK_PATH = /^\/api\/momentum[2356]\/run\/?$/;

export const MOMENTUM_TICK_HEADER = 'x-momentum-tick';

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Geheime tick-header: laat POST /api/momentum{2,3,5,6}/run langs de login als `x-momentum-tick`
 * gelijk is aan MOMENTUM_TICK_SECRET. Staat het secret niet (of leeg) dan is dit pad dicht.
 * De route zelf eist daarna nog steeds Bearer CRON_SECRET.
 */
export function isMomentumTickRequest(
  pathname: string,
  method: string,
  headerValue: string | null,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (method !== 'POST') return false;
  if (!MOMENTUM_TICK_PATH.test(pathname)) return false;
  const secret = env.MOMENTUM_TICK_SECRET?.trim();
  if (!secret || secret.length < 16) return false;
  if (!headerValue) return false;
  return constantTimeEqual(headerValue, secret);
}
