import { isHealthPath, shouldBlockMisconfiguredProduction } from './middleware-auth';

describe('middleware production auth (M-8)', () => {
  it('allows health paths but blocks the rest in production without app password', () => {
    const env = { NODE_ENV: 'production' } as NodeJS.ProcessEnv;
    expect(isHealthPath('/')).toBe(true);
    expect(shouldBlockMisconfiguredProduction('/', env)).toBe(false);
    expect(shouldBlockMisconfiguredProduction('/api/health', env)).toBe(false);
    expect(shouldBlockMisconfiguredProduction('/login', env)).toBe(true);
    expect(shouldBlockMisconfiguredProduction('/api/alpaca/orders', env)).toBe(true);
  });

  it('does not block in development without password', () => {
    const env = { NODE_ENV: 'development' } as NodeJS.ProcessEnv;
    expect(shouldBlockMisconfiguredProduction('/api/foo', env)).toBe(false);
  });
});
