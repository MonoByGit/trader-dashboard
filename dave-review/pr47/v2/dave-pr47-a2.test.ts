/** @jest-environment node */
import { verifyCronBearer } from '../../../../src/security/production-auth';
it('A2 niet-ASCII bearer met gelijke stringlengte geeft false, geen exception', () => {
  const env = process.env as Record<string, string | undefined>;
  const old = env.CRON_SECRET; env.CRON_SECRET = 'abc';
  try { expect(verifyCronBearer('Bearer abé')).toBe(false); } finally { if (old === undefined) delete env.CRON_SECRET; else env.CRON_SECRET = old; }
});
