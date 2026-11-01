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
