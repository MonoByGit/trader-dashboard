import { decideDueCryptoRoutines, utcDateYmd } from './decide-crypto';

describe('decideDueCryptoRoutines', () => {
  it('runs on UTC hour grid including weekends', () => {
    const sat = Date.parse('2026-11-01T14:05:00.000Z');
    expect(utcDateYmd(sat)).toBe('2026-11-01');
    const due = decideDueCryptoRoutines({
      nowMs: sat,
      runs: [],
      config: { tickIntervalHours: 2, tickGraceMinutes: 10 },
    });
    expect(due).toEqual(['crypto-scan']);
  });

  it('skips outside grace window', () => {
    const due = decideDueCryptoRoutines({
      nowMs: Date.parse('2026-11-01T14:25:00.000Z'),
      runs: [],
      config: { tickIntervalHours: 2, tickGraceMinutes: 10 },
    });
    expect(due).toEqual([]);
  });

  it('does not rerun within the same interval window', () => {
    const nowMs = Date.parse('2026-11-01T16:02:00.000Z');
    const due = decideDueCryptoRoutines({
      nowMs,
      runs: [
        {
          routine: 'crypto-scan',
          status: 'ok',
          finished_at: '2026-11-01T16:01:00.000Z',
        },
      ],
      config: { tickIntervalHours: 2, tickGraceMinutes: 10 },
    });
    expect(due).toEqual([]);
  });
});
