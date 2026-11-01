import { makeBars } from '../momentum2/fixtures';
import { simulateVersion } from '../momentum2/simulate';
import { resolveShadowMode } from '../momentum2/mode';
import type { Bar } from '../momentum2/types';
import { m5Versions } from './config';
import { m5Hooks, planM5 } from './plan';
import { bandTarget, freshUpSignal } from './signals';
import { newBook } from '../momentum2/book';
import { m5StopLevel, M5_AWAIT_FRESH_UP } from './risk';
import { closesOf, sma } from '../momentum2/indicators';

const [cfg] = m5Versions(100_000);

function qqqTrend(n: number, drift: number): Bar[] {
  return makeBars(n, 400, drift, 0.01);
}

describe('momentum5 modus', () => {
  it('DRY_RUN=0 wordt geweigerd', () => {
    expect(resolveShadowMode({ MOMENTUM5_ENABLED: '1', MOMENTUM5_DRY_RUN: '0' }, 'MOMENTUM5')).toMatchObject({ run: false });
    expect(resolveShadowMode({ MOMENTUM5_ENABLED: '1' }, 'MOMENTUM5')).toEqual({ run: true, shadow: true });
  });
});

describe('momentum5 signals', () => {
  it('band: boven +2% -> risk, onder -2% -> cash, ertussen hold', () => {
    const bars = qqqTrend(250, 0.001);
    const closes = closesOf(bars);
    const ma = sma(closes, 200)!;
    const last = bars.length - 1;
    bars[last] = { ...bars[last]!, c: ma * 1.03, h: ma * 1.03, l: ma * 1.03, o: ma * 1.03 };
    expect(bandTarget(bars, cfg!)).toBe('risk');
    bars[last] = { ...bars[last]!, c: ma * 0.97, h: ma * 0.97, l: ma * 0.97, o: ma * 0.97 };
    expect(bandTarget(bars, cfg!)).toBe('cash');
    bars[last] = { ...bars[last]!, c: ma * 1.001, h: ma * 1.001, l: ma * 1.001, o: ma * 1.001 };
    expect(bandTarget(bars, cfg!)).toBe('hold');
  });

  it('geen lookahead: signaal gebruikt niet de bar van morgen', () => {
    const bars = qqqTrend(250, 0.001);
    const withExtra = [...bars, { ...bars[bars.length - 1]!, t: '2099-12-31T00:00:00Z', c: 9999, h: 9999, l: 9999, o: 9999 }];
    expect(bandTarget(bars, cfg!)).toBe(bandTarget(withExtra.slice(0, -1), cfg!));
    expect(freshUpSignal(bars, cfg!)).toBe(freshUpSignal(withExtra.slice(0, -1), cfg!));
  });
});

describe('momentum5 risk', () => {
  it('15% trailing op QLD, geen stop op BIL', () => {
    const p = { entryPrice: 100, highWater: 120 };
    expect(m5StopLevel(p, cfg!, 'QLD').kind).toBe('trailing');
    expect(m5StopLevel(p, cfg!, 'BIL').level).toBeLessThan(0);
  });
});

describe('momentum5 simulate', () => {
  it('draait walk-forward met tagged book en 20% verliesgrens', async () => {
    const qqq = qqqTrend(280, 0.0008);
    const qld = makeBars(280, 50, 0.0016, 0.02);
    const bil = makeBars(280, 90, 0, 0.001);
    const spy = makeBars(280, 100, 0.0005, 0.01);
    const r = await simulateVersion(cfg!, {
      benchmark: spy,
      barsBySymbol: { QQQ: qqq, QLD: qld, BIL: bil, SPY: spy },
    }, { hooks: m5Hooks });
    expect(r.versionId).toBe('m5-nasdaq-trend');
    expect(cfg!.maxLossPct).toBe(0.2);
  });

  it('na trailing stop blijft cash tot fresh up', () => {
    const book = newBook(cfg!, '2024-01-01', 100);
    book.strategyState = { [M5_AWAIT_FRESH_UP]: true };
    book.positions.BIL = { qty: 100, entryPrice: 1, entryDate: '2024-01-01', highWater: 1 };
    const qqq = qqqTrend(250, 0.001);
    const closes = closesOf(qqq);
    const ma = sma(closes, 200)!;
    const i = qqq.length - 1;
    qqq[i] = { ...qqq[i]!, c: ma * 1.001, h: ma * 1.001, l: ma * 1.001, o: ma * 1.001 };
    const orders = planM5({ barsBySymbol: { QQQ: qqq, BIL: [], QLD: [] }, book, cfg: cfg! }).orders;
    expect(orders.every((o) => o.side !== 'buy' || o.symbol !== 'QLD')).toBe(true);
  });
});
