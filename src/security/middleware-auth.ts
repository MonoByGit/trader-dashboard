/** Edge-safe checks for production misconfiguration (M-8). */

export function productionAppAuthConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!(env.APP_PASSWORD_SHA256?.trim() || env.APP_PASSWORD?.trim());
}

export function isHealthPath(pathname: string): boolean {
  return pathname === '/' || pathname === '/api/health';
}

/** True when production has no app password and route must not be served (except health). */
export function shouldBlockMisconfiguredProduction(
  pathname: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.NODE_ENV !== 'production') return false;
  if (productionAppAuthConfigured(env)) return false;
  if (isHealthPath(pathname)) return false;
  return true;
}
