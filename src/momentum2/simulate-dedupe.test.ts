import { dedupeOrderIntents } from './simulate';

describe('dedupeOrderIntents', () => {
  it('houdt één order per symbool en kant', () => {
    const orders = dedupeOrderIntents([
      { symbol: 'AAA', side: 'buy', notionalUsd: 100, reason: 'carry' },
      { symbol: 'AAA', side: 'buy', notionalUsd: 200, reason: 'plan' },
      { symbol: 'AAA', side: 'sell', qty: 1, reason: 'sell' },
    ]);
    expect(orders).toHaveLength(2);
    expect(orders.find((o) => o.side === 'buy')?.notionalUsd).toBe(100);
  });
});
