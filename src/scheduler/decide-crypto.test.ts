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

  it('does not schedule another scan in the same UTC slot after success', () => {
    const due = decideDueCryptoRoutines({
      nowMs: Date.parse('2026-11-01T16:05:00.000Z'),
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

  it('resumes on the next UTC slot after a failed run leaves the retry window (10:06Z fail, 12:02Z tick)', () => {
    const due = decideDueCryptoRoutines({
      nowMs: Date.parse('2026-11-01T12:02:00.000Z'),
      runs: [
        {
          routine: 'crypto-scan',
          status: 'failed',
          started_at: '2026-11-01T10:00:00.000Z',
          finished_at: '2026-11-01T10:06:00.000Z',
        },
      ],
      config: { tickIntervalHours: 2, tickGraceMinutes: 10, retryWindowMinutes: 45 },
    });
    expect(due).toEqual(['crypto-scan']);
  });

  it('schedules again after the full interval (2 hours)', () => {
    const due = decideDueCryptoRoutines({
      nowMs: Date.parse('2026-11-01T16:05:00.000Z'),
      runs: [
        {
          routine: 'crypto-scan',
          status: 'ok',
          finished_at: '2026-11-01T14:05:00.000Z',
        },
      ],
      config: { tickIntervalHours: 2, tickGraceMinutes: 10 },
    });
    expect(due).toEqual(['crypto-scan']);
  });
});
