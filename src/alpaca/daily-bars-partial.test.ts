import {
  dailyBarsExcludingTodayPartial,
  lastCompletedSessionClose,
} from './daily-bars-partial';

describe('dailyBarsExcludingTodayPartial', () => {
  it('drops the partial bar for today ET when chase/snapshot would compare to itself', () => {
    const todayEt = '2026-11-01';
    const bars = [
      { c: 100, t: '2026-10-30T04:00:00.000Z' },
      { c: 102, t: '2026-10-31T04:00:00.000Z' },
      { c: 110, t: '2026-11-01T04:00:00.000Z' },
    ];
    expect(lastCompletedSessionClose(bars, todayEt)).toBe(102);
    expect(dailyBarsExcludingTodayPartial(bars, todayEt)).toHaveLength(2);
  });

  it('drops UTC midnight crypto partial on UTC today while NY is still prior calendar day', () => {
    const todayUtc = '2026-11-01';
    const bars = [
      { c: 80, v: 1000, t: '2026-10-31T00:00:00.000Z' },
      { c: 82, v: 1200, t: '2026-11-01T00:00:00.000Z' },
    ];
    const completed = dailyBarsExcludingTodayPartial(bars, todayUtc, { calendar: 'utc' });
    expect(completed).toHaveLength(1);
    expect(completed[0]!.t).toBe('2026-10-31T00:00:00.000Z');
  });

  it('ET ETF path unchanged: UTC midnight bar is not treated as today ET', () => {
    const todayEt = '2026-11-01';
    const bars = [
      { c: 80, t: '2026-10-31T00:00:00.000Z' },
      { c: 82, t: '2026-11-01T00:00:00.000Z' },
    ];
    expect(dailyBarsExcludingTodayPartial(bars, todayEt)).toHaveLength(2);
    expect(dailyBarsExcludingTodayPartial(bars, todayEt, { calendar: 'et' })).toHaveLength(2);
  });
});
