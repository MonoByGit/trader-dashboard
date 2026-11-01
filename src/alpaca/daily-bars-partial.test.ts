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
});
