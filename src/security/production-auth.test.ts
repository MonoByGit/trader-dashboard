import {
  assertProductionAuthEnv,
  cronAuthConfigured,
  listMissingProductionAuthEnv,
  verifyCronBearer,
} from './production-auth';

describe('production auth env', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.CRON_SECRET;
    delete process.env.APP_PASSWORD;
    delete process.env.APP_PASSWORD_SHA256;
  });

  afterAll(() => {
    process.env = env;
  });

  it('lists missing secrets in production', () => {
    process.env.NODE_ENV = 'production';
    expect(listMissingProductionAuthEnv()).toEqual([
      'CRON_SECRET',
      'APP_PASSWORD or APP_PASSWORD_SHA256',
    ]);
  });

  it('refuses to start in production without auth env', () => {
    process.env.NODE_ENV = 'production';
    expect(() => assertProductionAuthEnv()).toThrow(/Refusing to start/);
  });

  it('allows dev without CRON_SECRET for cron bearer check', () => {
    process.env.NODE_ENV = 'development';
    expect(verifyCronBearer(null)).toBe(true);
    expect(cronAuthConfigured()).toBe(false);
  });

  it('rejects cron bearer in production when CRON_SECRET unset', () => {
    process.env.NODE_ENV = 'production';
    expect(verifyCronBearer('Bearer anything')).toBe(false);
    expect(cronAuthConfigured()).toBe(false);
  });

  it('accepts matching bearer when CRON_SECRET is set', () => {
    process.env.CRON_SECRET = 'test-secret';
    expect(verifyCronBearer('Bearer test-secret')).toBe(true);
  });

  it('weigert verkeerde lengte timing-safe', () => {
    process.env.CRON_SECRET = 'test-secret';
    expect(verifyCronBearer('Bearer test-secre')).toBe(false);
    expect(verifyCronBearer('Bearer test-secrett')).toBe(false);
  });

  it('niet-ASCII bearer van gelijke stringlengte geeft false, geen RangeError', () => {
    process.env.CRON_SECRET = 'test-secret';
    expect(() => verifyCronBearer('Bearer test-secreé')).not.toThrow();
    expect(verifyCronBearer('Bearer test-secreé')).toBe(false);
  });
});
