import { shouldScheduleRoutineRun, RUNNING_STALE_MS } from './run-status.js';
import type { RoutineRunRecord } from './decide.js';

describe('shouldScheduleRoutineRun', () => {
  const now = Date.parse('2026-06-03T14:00:00Z');

  it('blocks while a run is still running (younger than stale window)', () => {
    const last: RoutineRunRecord = {
      routine: 'market-open',
      trading_date: '2026-06-03',
      status: 'running',
      started_at: new Date(now - 5 * 60_000).toISOString(),
      finished_at: null,
    };
    expect(shouldScheduleRoutineRun(last, now, 45)).toBe(false);
  });

  it('allows redispatch after running exceeds stale window', () => {
    const last: RoutineRunRecord = {
      routine: 'market-open',
      trading_date: '2026-06-03',
      status: 'running',
      started_at: new Date(now - RUNNING_STALE_MS - 1000).toISOString(),
      finished_at: null,
    };
    expect(shouldScheduleRoutineRun(last, now, 45)).toBe(true);
  });

  it('does not treat running as failed-with-null-finished (double dispatch)', () => {
    const last: RoutineRunRecord = {
      routine: 'market-open',
      trading_date: '2026-06-03',
      status: 'running',
      started_at: new Date(now - 60_000).toISOString(),
      finished_at: null,
    };
    expect(shouldScheduleRoutineRun(last, now, 45)).toBe(false);
  });
});
