import { makeBars } from './fixtures';
import { rotationHooks } from './hooks';
import { MOMENTUM2_BASE } from './config';
import { walkForwardCarry } from './walkforward-carry';
import { simulateVersion } from './simulate';
import { m5Hooks } from '../momentum5/plan';
import { m5Versions } from '../momentum5/config';

describe('walkForwardCarry', () => {
  const cfg = { ...MOMENTUM2_BASE, universe: ['AAA'], topN: 1, lookbackDays: 5, smaDays: 10, volDays: 5, rebalanceEveryDays: 1 };
  const bench = makeBars(40, 100, 0.001);
  const aaa = makeBars(40, 50, 0.002);

  it('draait een partieel laatste venster tot de einddatum', async () => {
    const w = await walkForwardCarry({
      cfg,
      data: { benchmark: bench, barsBySymbol: { AAA: aaa } },
      hooks: rotationHooks,
      testDays: 90,
    });
    expect(w.windows.length).toBeGreaterThan(0);
    expect(w.oosPeriodEnd).toBe(bench[bench.length - 1]!.t.slice(0, 10));
  });

  it('geeft pending orders door naar het volgende venster', async () => {
    const [m5] = m5Versions();
    const qqq = makeBars(250, 400, 0.001);
    const qld = makeBars(250, 50, 0.002);
    const bil = makeBars(250, 90, 0, 0.001);
    const slice1 = { benchmark: qqq.slice(0, 210), barsBySymbol: { QQQ: qqq.slice(0, 210), QLD: qld.slice(0, 210), BIL: bil.slice(0, 210) } };
    const r1 = await simulateVersion(m5!, slice1, { hooks: m5Hooks });
    const r2 = await simulateVersion(m5!, { benchmark: qqq, barsBySymbol: { QQQ: qqq, QLD: qld, BIL: bil } }, {
      hooks: m5Hooks,
      initialBook: r1.book,
      initialPending: r1.pendingOrders,
    });
    expect(r2.trades.length + r1.trades.length).toBeGreaterThan(0);
  });
});
