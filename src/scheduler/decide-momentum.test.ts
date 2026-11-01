import { decideDueMomentum, MOMENTUM_TIMING } from './decide-momentum';
import type { CalendarDay, RoutineRunRecord } from './decide';

// maandag 2-11-2026: EST (UTC-5), open 09:30 = 14:30Z, close 16:00 = 21:00Z
const mon: CalendarDay = { date: '2026-11-02', open: '09:30', close: '16:00' };
const at = (iso: string) => new Date(iso).getTime();
const names = (nowIso: string, runs: RoutineRunRecord[] = [], cal: CalendarDay | null = mon) =>
  decideDueMomentum({ nowMs: at(nowIso), calendarToday: cal, runs }).map((j) => j.routine).sort();

describe('decideDueMomentum', () => {
  it('voor de open: alleen M6 (UTC-dag al begonnen)', () => {
    expect(names('2026-11-02T14:00:00Z')).toEqual(['momentum6-run']);
  });

  it('na de open: execute voor M2, M3, M5 (en M6)', () => {
    expect(names('2026-11-02T14:50:00Z')).toEqual([
      'momentum2-execute', 'momentum3-execute', 'momentum5-execute', 'momentum6-run',
    ]);
  });

  it('na de close: decide voor M2, M3, M5', () => {
    expect(names('2026-11-02T21:25:00Z', [{ routine: 'momentum6-run', trading_date: '2026-11-02', status: 'ok' }])).toEqual([
      'momentum2-decide', 'momentum3-decide', 'momentum5-decide',
    ]);
  });

  it('nooit M4', () => {
    expect(names('2026-11-02T14:50:00Z').some((n) => n.includes('momentum4'))).toBe(false);
  });

  it('ok telt als klaar voor die dag; skipped/failed proberen opnieuw tot het maximum', () => {
    const ok: RoutineRunRecord = { routine: 'momentum5-execute', trading_date: '2026-11-02', status: 'ok' };
    expect(names('2026-11-02T15:00:00Z', [ok])).not.toContain('momentum5-execute');
    const skipped = Array.from({ length: MOMENTUM_TIMING.maxAttemptsPerDay - 1 }, () => ({
      routine: 'momentum5-execute', trading_date: '2026-11-02', status: 'skipped',
    }));
    expect(names('2026-11-02T15:00:00Z', skipped)).toContain('momentum5-execute');
    skipped.push({ routine: 'momentum5-execute', trading_date: '2026-11-02', status: 'failed' });
    expect(names('2026-11-02T15:00:00Z', skipped)).not.toContain('momentum5-execute');
  });

  it('lopende run (niet stale) wordt niet dubbel gestart', () => {
    const running: RoutineRunRecord = {
      routine: 'momentum2-execute', trading_date: '2026-11-02', status: 'running', started_at: '2026-11-02T14:55:00Z',
    };
    expect(names('2026-11-02T15:00:00Z', [running])).not.toContain('momentum2-execute');
  });

  it('geen handelsdag: geen ETF-stappen', () => {
    expect(names('2026-11-02T15:00:00Z', [], null)).toEqual(['momentum6-run']);
  });

  it('M6 per UTC-datum, pas na 00:30 UTC', () => {
    expect(names('2026-11-03T00:10:00Z', [{ routine: 'momentum6-run', trading_date: '2026-11-02', status: 'ok' }], null)).toEqual([]);
    expect(names('2026-11-03T00:35:00Z', [{ routine: 'momentum6-run', trading_date: '2026-11-02', status: 'ok' }], null)).toEqual([
      'momentum6-run',
    ]);
  });
});
