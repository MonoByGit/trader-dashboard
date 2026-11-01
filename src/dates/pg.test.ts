import { compareYmdAsc, pgDateToYmd, pgTimestampToHm } from './pg';
import { computeSnapshotSeries } from '../snapshots/returns';

describe('pg date helpers', () => {
  it('pgDateToYmd accepts Date and string', () => {
    expect(pgDateToYmd(new Date('2026-11-01T12:00:00.000Z'))).toBe('2026-11-01');
    expect(pgDateToYmd('2026-11-01')).toBe('2026-11-01');
  });

  it('pgTimestampToHm works for Date timestamps from pg', () => {
    expect(pgTimestampToHm(new Date('2026-11-01T14:35:22.000Z'))).toBe('14:35');
  });
});

describe('computeSnapshotSeries with pg Date tradingDate', () => {
  it('sorts rows when tradingDate is a Date object', () => {
    const out = computeSnapshotSeries(
      [
        { tradingDate: new Date('2026-11-02T00:00:00.000Z'), equity: 101_000, spyClose: 500 },
        { tradingDate: new Date('2026-11-01T00:00:00.000Z'), equity: 100_000, spyClose: 490 },
      ],
      100_000,
      490,
    );
    expect(out.map((r) => pgDateToYmd(r.tradingDate))).toEqual(['2026-11-01', '2026-11-02']);
    expect(compareYmdAsc(out[0]!.tradingDate, out[1]!.tradingDate)).toBeLessThan(0);
  });
});
