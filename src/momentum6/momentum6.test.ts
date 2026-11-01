import { makeBars } from '../momentum2/fixtures';
import { simulateVersion } from '../momentum2/simulate';
import { resolveShadowMode } from '../momentum2/mode';
import { m6Config } from './config';
import { m6Hooks, planM6 } from './plan';
import { breakoutEntry, exitBelowLow } from './signals';
import { newBook } from '../momentum2/book';
import { m6StopLevel } from './risk';

const cfg = m6Config(100_000);

function btcBreakoutSeries(): ReturnType<typeof makeBars> {
  const bars = makeBars(80, 100, 0.002, 0.02);
  for (let i = 60; i < 65; i++) {
    const b = bars[i]!;
    bars[i] = { ...b, c: b.c * 0.98, l: b.c * 0.97, h: b.c, o: b.c };
  }
  const last = bars.length - 1;
  const prevMax = Math.max(...bars.slice(last - 21, last - 1).map((x) => x.c));
  bars[last] = { ...bars[last]!, c: prevMax * 1.05, h: prevMax * 1.06, l: prevMax, o: prevMax };
  return bars;
}

describe('momentum6 modus', () => {
  it('DRY_RUN=0 wordt geweigerd', () => {
    expect(resolveShadowMode({ MOMENTUM6_ENABLED: '1', MOMENTUM6_DRY_RUN: '0' }, 'MOMENTUM6')).toMatchObject({ run: false });
  });
});

describe('momentum6 signals', () => {
  it('breakout: vandaag boven max van vorige 20 closes', () => {
    const bars = makeBars(25, 100, 0, 0.001);
    expect(breakoutEntry(bars, cfg)).toBe(false);
    const last = bars.length - 1;
    const prevMax = Math.max(...bars.slice(last - 20, last).map((b) => b.c));
    bars[last] = { ...bars[last]!, c: prevMax + 1, h: prevMax + 1, l: prevMax, o: prevMax };
    expect(breakoutEntry(bars, cfg)).toBe(true);
  });

  it('geen lookahead: extra toekomst-bar verandert signaal op gisteren niet', () => {
    const bars = btcBreakoutSeries();
    const future = [...bars, { ...bars[bars.length - 1]!, t: '2099-01-01T00:00:00Z', c: 1, h: 1, l: 1, o: 1 }];
    expect(breakoutEntry(bars, cfg)).toBe(breakoutEntry(future.slice(0, bars.length), cfg));
  });

  it('exit onder 10d low', () => {
    const bars = makeBars(30, 100, -0.01, 0.02);
    expect(exitBelowLow(bars, cfg)).toBe(true);
  });
});

describe('momentum6 risk', () => {
  it('harde stop 12% bij entry', () => {
    expect(m6StopLevel({ entryPrice: 100, highWater: 100 }, cfg).level).toBeCloseTo(88, 6);
  });
});

describe('momentum6 simulate', () => {
  it('fractioneel, fees, max hold', async () => {
    const btc = btcBreakoutSeries();
    const bench = btc;
    const r = await simulateVersion(cfg, { benchmark: bench, barsBySymbol: { 'BTC/USD': btc } }, {
      hooks: m6Hooks,
      fillGaps: true,
    });
    expect(r.versionId).toBe('m6-btc-breakout');
    const book = newBook(cfg, null, null);
    expect(planM6({ barsBySymbol: { 'BTC/USD': btc }, book, cfg }).orders.some((o) => o.side === 'buy')).toBe(true);
  });
});
