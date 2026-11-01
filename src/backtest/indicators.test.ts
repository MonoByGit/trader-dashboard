import { snapshotAtIndex } from './indicators';
import type { DailyBar } from './types';

describe('backtest indicators', () => {
  it('snapshotAtIndex uses only past bars', () => {
    const bars: DailyBar[] = [];
    for (let i = 0; i < 25; i++) {
      bars.push({
        t: `2026-01-${String(i + 1).padStart(2, '0')}T21:00:00Z`,
        o: 100,
        h: 101,
        l: 99,
        c: 100 + i * 0.1,
        v: 1_000_000,
      });
    }
    const at20 = snapshotAtIndex(bars, 20);
    const at24 = snapshotAtIndex(bars, 24);
    expect(at20).not.toBeNull();
    expect(at24).not.toBeNull();
    expect(at24!.lastClose).toBeGreaterThan(at20!.lastClose);
    expect(at24!.lastClose).toBeCloseTo(102.4, 1);
  });
});
