import {
  decideDueRoutines,
  sessionBoundsEt,
  tradingDateEt,
  type CalendarDay,
  type RoutineRunRecord,
} from './decide.js';

describe('scheduler decideDueRoutines', () => {
  const day: CalendarDay = { date: '2026-06-03', open: '09:30', close: '16:00' };
  const { openMs, closeMs } = sessionBoundsEt(day);

  it('fires premarket ~30 min before open', () => {
    const nowMs = openMs - 30 * 60_000;
    const due = decideDueRoutines({ nowMs, calendarToday: day, calendarThisWeek: [day], runs: [] });
    expect(due).toContain('premarket');
  });

  it('skips on holiday (no calendar row)', () => {
    const nowMs = openMs - 30 * 60_000;
    const due = decideDueRoutines({ nowMs, calendarToday: null, calendarThisWeek: [], runs: [] });
    expect(due).toEqual([]);
  });

  it('respects half-day early close for eod window', () => {
    const half: CalendarDay = { date: '2026-11-28', open: '09:30', close: '13:00' };
    const bounds = sessionBoundsEt(half);
    const eodTarget = bounds.closeMs - 10 * 60_000;
    const due = decideDueRoutines({
      nowMs: eodTarget,
      calendarToday: half,
      calendarThisWeek: [half],
      runs: [],
    });
    expect(due).toContain('eod');
  });

  it('dedupes after successful run', () => {
    const nowMs = openMs - 30 * 60_000;
    const tradingDate = tradingDateEt(nowMs);
    const runs: RoutineRunRecord[] = [
      { routine: 'premarket', trading_date: tradingDate, status: 'ok', finished_at: new Date(nowMs).toISOString() },
    ];
    const due = decideDueRoutines({ nowMs, calendarToday: day, calendarThisWeek: [day], runs });
    expect(due).not.toContain('premarket');
  });

  it('does not redispatch while a run is still running', () => {
    const nowMs = openMs + 5 * 60_000;
    const tradingDate = tradingDateEt(nowMs);
    const runs: RoutineRunRecord[] = [
      {
        routine: 'market-open',
        trading_date: tradingDate,
        status: 'running',
        started_at: new Date(nowMs - 2 * 60_000).toISOString(),
        finished_at: null,
      },
    ];
    const due = decideDueRoutines({ nowMs, calendarToday: day, calendarThisWeek: [day], runs });
    expect(due).not.toContain('market-open');
  });

  it('retries failed run within retry window', () => {
    const nowMs = openMs - 30 * 60_000;
    const tradingDate = tradingDateEt(nowMs);
    const runs: RoutineRunRecord[] = [
      {
        routine: 'premarket',
        trading_date: tradingDate,
        status: 'failed',
        started_at: new Date(nowMs - 20 * 60_000).toISOString(),
        finished_at: new Date(nowMs - 10 * 60_000).toISOString(),
      },
    ];
    const due = decideDueRoutines({ nowMs, calendarToday: day, calendarThisWeek: [day], runs });
    expect(due).toContain('premarket');
  });

  it('dedupes using latest finished_at when values are Date objects (pg driver shape)', () => {
    const nowMs = openMs - 30 * 60_000;
    const tradingDate = tradingDateEt(nowMs);
    const runs: RoutineRunRecord[] = [
      {
        routine: 'premarket',
        trading_date: tradingDate,
        status: 'ok',
        finished_at: new Date(nowMs - 60 * 60_000),
      },
      {
        routine: 'premarket',
        trading_date: tradingDate,
        status: 'ok',
        finished_at: new Date(nowMs),
      },
    ];
    expect(() =>
      decideDueRoutines({ nowMs, calendarToday: day, calendarThisWeek: [day], runs }),
    ).not.toThrow();
    const due = decideDueRoutines({ nowMs, calendarToday: day, calendarThisWeek: [day], runs });
    expect(due).not.toContain('premarket');
  });

  it('handles DST spring forward session bounds', () => {
    const dstDay: CalendarDay = { date: '2026-03-09', open: '09:30', close: '16:00' };
    const bounds = sessionBoundsEt(dstDay);
    expect(bounds.closeMs).toBeGreaterThan(bounds.openMs);
    const due = decideDueRoutines({
      nowMs: bounds.openMs + 5 * 60_000,
      calendarToday: dstDay,
      calendarThisWeek: [dstDay],
      runs: [],
    });
    expect(due).toContain('market-open');
  });
});
