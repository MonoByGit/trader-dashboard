import { shouldBlockMisconfiguredProduction } from './middleware-auth';

describe('middleware production auth (M-8)', () => {
  const prodNoPassword = { NODE_ENV: 'production' } as NodeJS.ProcessEnv;

  it('returns 503 for / and API routes without app password in production', () => {
    expect(shouldBlockMisconfiguredProduction('/', prodNoPassword)).toBe(true);
    expect(shouldBlockMisconfiguredProduction('/api/alpaca/positions', prodNoPassword)).toBe(true);
  });

  it('allows only /api/health, login and auth API when misconfigured', () => {
    expect(shouldBlockMisconfiguredProduction('/api/health', prodNoPassword)).toBe(false);
    expect(shouldBlockMisconfiguredProduction('/login', prodNoPassword)).toBe(false);
    expect(shouldBlockMisconfiguredProduction('/api/auth/login', prodNoPassword)).toBe(false);
  });

  it('does not block when app password is set', () => {
    const env = {
      NODE_ENV: 'production',
      APP_PASSWORD: 'configured',
    } as NodeJS.ProcessEnv;
    expect(shouldBlockMisconfiguredProduction('/', env)).toBe(false);
  });

  it('does not block in development without password', () => {
    const env = { NODE_ENV: 'development' } as NodeJS.ProcessEnv;
    expect(shouldBlockMisconfiguredProduction('/api/foo', env)).toBe(false);
  });
});
