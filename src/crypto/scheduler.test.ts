import { decideCryptoTickDue } from './scheduler';

describe('crypto scheduler', () => {
  const intervalHours = 2;

  it('runs when never executed before', () => {
    expect(
      decideCryptoTickDue({ nowMs: Date.UTC(2026, 10, 1, 12), intervalHours, lastFinishedAtMs: null }),
    ).toBe(true);
  });

  it('runs on weekend when interval elapsed', () => {
    const last = Date.UTC(2026, 10, 1, 8); // Saturday
    const now = Date.UTC(2026, 10, 1, 11); // 3h later
    expect(decideCryptoTickDue({ nowMs: now, intervalHours, lastFinishedAtMs: last })).toBe(true);
  });

  it('skips when inside interval window', () => {
    const last = Date.UTC(2026, 10, 1, 10);
    const now = Date.UTC(2026, 10, 1, 11);
    expect(decideCryptoTickDue({ nowMs: now, intervalHours, lastFinishedAtMs: last })).toBe(false);
  });
});
