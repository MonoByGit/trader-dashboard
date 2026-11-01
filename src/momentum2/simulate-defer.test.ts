import { makeBars } from './fixtures';
import { rotationHooks } from './hooks';
import { MOMENTUM2_BASE } from './config';
import { simulateVersion } from './simulate';

describe('simulate deferred orders', () => {
  it('laat een order staan als er geen bar is en logt defer', async () => {
    const cfg = { ...MOMENTUM2_BASE, universe: ['AAA', 'ZZZ'], topN: 1, lookbackDays: 5, smaDays: 10, volDays: 5, rebalanceEveryDays: 1 };
    const bench = makeBars(25, 100, 0.001);
    const aaa = makeBars(25, 50, 0.002);
    const r = await simulateVersion(cfg, { benchmark: bench, barsBySymbol: { AAA: aaa, ZZZ: [] } }, {
      hooks: rotationHooks,
      initialPending: [{ symbol: 'ZZZ', side: 'buy', notionalUsd: 500, reason: 'test defer' }],
    });
    expect(r.deferLog.some((d) => d.reason.includes('geen bar'))).toBe(true);
    expect(r.pendingOrders.some((o) => o.symbol === 'ZZZ')).toBe(true);
  });
});
