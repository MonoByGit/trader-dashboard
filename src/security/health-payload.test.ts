import { healthPayloadHasNoAccountData, productionHealthPayload } from './health-payload';

describe('/api/health payload (M-8)', () => {
  it('returns 200-style body with ok/status only and no account data', () => {
    const body = productionHealthPayload();
    expect(body).toEqual({ ok: true, status: 'ok' });
    expect(healthPayloadHasNoAccountData(body)).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/equity|position|secret|password/i);
  });
});
