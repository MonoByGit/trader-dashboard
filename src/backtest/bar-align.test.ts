import { alignBenchmarkBarsToTradingDates, barOnOrBefore } from './bar-align';
import type { DailyBar } from './types';

describe('alignBenchmarkBarsToTradingDates', () => {
  it('forward-fills BTC benchmark onto crypto trading dates', () => {
    const bars: DailyBar[] = [
      { t: '2025-11-02T00:00:00Z', o: 100, h: 100, l: 100, c: 100, v: 1 },
      { t: '2025-11-04T00:00:00Z', o: 110, h: 110, l: 110, c: 110, v: 1 },
    ];
    const dates = ['2025-11-01', '2025-11-02', '2025-11-03', '2025-11-04'];
    const aligned = alignBenchmarkBarsToTradingDates(dates, bars);
    expect(aligned).toHaveLength(3);
    expect(aligned[0]!.c).toBe(100);
    expect(aligned[1]!.c).toBe(100);
    expect(aligned[2]!.c).toBe(110);
  });

  it('barOnOrBefore picks latest bar on or before date', () => {
    const bars: DailyBar[] = [
      { t: '2025-01-05T00:00:00Z', o: 50, h: 50, l: 50, c: 50, v: 1 },
    ];
    expect(barOnOrBefore(bars, '2025-01-10')?.c).toBe(50);
    expect(barOnOrBefore(bars, '2025-01-03')).toBeUndefined();
  });
});
