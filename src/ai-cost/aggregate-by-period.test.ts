import { aggregateAiCostsByDay, aggregateAiCostsByWeek } from './aggregate-by-period';

describe('aggregateAiCostsByDay', () => {
  it('merges asset classes and sorts when day is a Date (node-pg shape)', () => {
    const byDay = aggregateAiCostsByDay([
      { day: new Date('2026-11-01T00:00:00.000Z'), asset_class: 'etf', cost_usd: 1.2 },
      { day: new Date('2026-11-01T00:00:00.000Z'), asset_class: 'crypto', cost_usd: 0.3 },
      { day: new Date('2026-11-02T00:00:00.000Z'), asset_class: 'etf', cost_usd: 0.5 },
    ]);

    expect(byDay).toHaveLength(2);
    expect(byDay[0]).toMatchObject({
      day: '2026-11-02',
      etf_usd: 0.5,
      crypto_usd: 0,
      cost_usd: 0.5,
    });
    expect(byDay[1]).toMatchObject({
      day: '2026-11-01',
      etf_usd: 1.2,
      crypto_usd: 0.3,
      cost_usd: 1.5,
    });
  });

  it('does not throw when sorting Date buckets (regression: localeCompare on Date)', () => {
    expect(() =>
      aggregateAiCostsByDay([
        { day: new Date('2026-10-30T00:00:00.000Z'), asset_class: 'etf', cost_usd: 1 },
        { day: new Date('2026-10-31T00:00:00.000Z'), asset_class: 'etf', cost_usd: 2 },
      ]),
    ).not.toThrow();
  });
});

describe('aggregateAiCostsByWeek', () => {
  it('aggregates by week_start when values are Date objects', () => {
    const byWeek = aggregateAiCostsByWeek([
      { week_start: new Date('2026-10-27T00:00:00.000Z'), asset_class: 'etf', cost_usd: 4 },
      { week_start: new Date('2026-10-27T00:00:00.000Z'), asset_class: 'crypto', cost_usd: 1 },
    ]);
    expect(byWeek).toHaveLength(1);
    expect(byWeek[0]).toMatchObject({
      week_start: '2026-10-27',
      etf_usd: 4,
      crypto_usd: 1,
      cost_usd: 5,
    });
  });
});
