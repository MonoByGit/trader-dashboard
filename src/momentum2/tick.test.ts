import { decideMomentumTick, momentumDoneKey, isDoneResult } from './tick';

// Ma 2-11-2026 (EST sinds 1-11): open 09:30 ET = 14:30Z, close 16:00 ET = 21:00Z.
const day = { date: '2026-11-02', open: '09:30', close: '16:00' };
const utc = (s: string) => Date.parse(s);
const none = new Set<string>();

describe('decideMomentumTick', () => {
  it('voor de open en midden op de dag: alleen niets (aandelen)', () => {
    expect(decideMomentumTick({ nowMs: utc('2026-11-02T14:35:00Z'), calendarToday: day, done: none })).toEqual([]);
    expect(decideMomentumTick({ nowMs: utc('2026-11-02T18:00:00Z'), calendarToday: day, done: none })).toEqual([]);
  });
  it('na de open: execute voor M2, M3 en M5, nooit M4 of M6', () => {
    const r = decideMomentumTick({ nowMs: utc('2026-11-02T14:42:00Z'), calendarToday: day, done: none });
    expect(r.map((x) => `${x.name}:${x.step}`)).toEqual(['momentum2:execute', 'momentum3:execute', 'momentum5:execute']);
    expect(r.some((x) => (x.name as string) === 'momentum4')).toBe(false);
  });
  it('na de close: decide voor M2, M3 en M5', () => {
    const r = decideMomentumTick({ nowMs: utc('2026-11-02T21:20:00Z'), calendarToday: day, done: none });
    expect(r.map((x) => `${x.name}:${x.step}`)).toEqual(['momentum2:decide', 'momentum3:decide', 'momentum5:decide']);
  });
  it('gedaan-markering voorkomt dubbel draaien', () => {
    const done = new Set([momentumDoneKey({ name: 'momentum2', step: 'execute', dayKey: '2026-11-02' })]);
    const r = decideMomentumTick({ nowMs: utc('2026-11-02T14:42:00Z'), calendarToday: day, done });
    expect(r.map((x) => x.name)).toEqual(['momentum3', 'momentum5']);
  });
  it('geen handelsdag (weekend): geen aandelenstappen, wel M6 na de UTC-daggrens', () => {
    const r = decideMomentumTick({ nowMs: utc('2026-11-01T00:35:00Z'), calendarToday: null, done: none });
    expect(r.map((x) => `${x.name}:${x.step}:${x.dayKey}`)).toEqual([
      'momentum6:decide:2026-11-01',
      'momentum6:execute:2026-11-01',
    ]);
    expect(decideMomentumTick({ nowMs: utc('2026-11-01T14:42:00Z'), calendarToday: null, done: none })).toEqual([]);
  });
  it('zomertijd: open 13:30Z', () => {
    const summer = { date: '2026-06-01', open: '09:30', close: '16:00' };
    expect(decideMomentumTick({ nowMs: utc('2026-06-01T13:42:00Z'), calendarToday: summer, done: none })).toHaveLength(3);
    expect(decideMomentumTick({ nowMs: utc('2026-06-01T14:42:00Z'), calendarToday: summer, done: none })).toHaveLength(3);
  });
  it('isDoneResult: overgeslagen telt niet als gedaan', () => {
    expect(isDoneResult({ skipped: true, reason: 'markt gesloten' })).toBe(false);
    expect(isDoneResult({ step: 'execute', trades: 0 })).toBe(true);
  });
});
