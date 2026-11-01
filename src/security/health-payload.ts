/** Minimal health response — never account or secret fields. */
export function productionHealthPayload(): { ok: true; status: 'ok' } {
  return { ok: true, status: 'ok' };
}

const FORBIDDEN_HEALTH_KEYS = [
  'equity',
  'positions',
  'cash',
  'account',
  'key',
  'secret',
  'password',
  'token',
] as const;

export function healthPayloadHasNoAccountData(body: Record<string, unknown>): boolean {
  const keys = Object.keys(body).map((k) => k.toLowerCase());
  return !FORBIDDEN_HEALTH_KEYS.some((bad) => keys.some((k) => k.includes(bad)));
}
