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

import { isMomentumTickRequest } from './middleware-auth';

describe('isMomentumTickRequest (geheime tick-header)', () => {
  const env = { MOMENTUM_TICK_SECRET: 'een-lang-geheim-1234' } as NodeJS.ProcessEnv;
  it('juiste header op M2/M3/M5/M6 POST: door', () => {
    for (const n of [2, 3, 5, 6]) {
      expect(isMomentumTickRequest(`/api/momentum${n}/run`, 'POST', 'een-lang-geheim-1234', env)).toBe(true);
    }
  });
  it('verkeerde, lege of ontbrekende header: dicht', () => {
    expect(isMomentumTickRequest('/api/momentum2/run', 'POST', 'fout', env)).toBe(false);
    expect(isMomentumTickRequest('/api/momentum2/run', 'POST', '', env)).toBe(false);
    expect(isMomentumTickRequest('/api/momentum2/run', 'POST', null, env)).toBe(false);
  });
  it('geen secret ingesteld of te kort: altijd dicht', () => {
    expect(isMomentumTickRequest('/api/momentum2/run', 'POST', 'x', {} as NodeJS.ProcessEnv)).toBe(false);
    expect(isMomentumTickRequest('/api/momentum2/run', 'POST', 'kort', { MOMENTUM_TICK_SECRET: 'kort' } as NodeJS.ProcessEnv)).toBe(false);
  });
  it('geen M4, geen andere routes, geen GET', () => {
    expect(isMomentumTickRequest('/api/momentum4/run', 'POST', 'een-lang-geheim-1234', env)).toBe(false);
    expect(isMomentumTickRequest('/api/orders', 'POST', 'een-lang-geheim-1234', env)).toBe(false);
    expect(isMomentumTickRequest('/api/momentum2/run', 'GET', 'een-lang-geheim-1234', env)).toBe(false);
  });
});
