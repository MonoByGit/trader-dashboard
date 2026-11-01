import { aggregateHourlyToDaily, firstBracketHit, hourlyBarsForTradingDate } from './intraday-brackets';
import type { DailyBar } from './types';

describe('intraday brackets', () => {
  const hourly: DailyBar[] = [
    { t: '2024-01-02T14:00:00Z', o: 100, h: 101, l: 99, c: 100.5, v: 1 },
    { t: '2024-01-02T15:00:00Z', o: 100.5, h: 102, l: 98, c: 99, v: 1 },
    { t: '2024-01-03T14:00:00Z', o: 99, h: 100, l: 98, c: 99.5, v: 1 },
  ];

  it('filters hourly bars by trading date', () => {
    expect(hourlyBarsForTradingDate(hourly, '2024-01-02')).toHaveLength(2);
  });

  it('detects stop before take-profit intraday', () => {
    const day = hourlyBarsForTradingDate(hourly, '2024-01-02');
    const hit = firstBracketHit(98.5, 105, day);
    expect(hit?.hit).toBe('stop');
  });

  it('aggregates hourly to daily', () => {
    const daily = aggregateHourlyToDaily(hourly);
    expect(daily).toHaveLength(2);
    expect(daily[0]!.h).toBe(102);
    expect(daily[0]!.l).toBe(98);
  });
});
