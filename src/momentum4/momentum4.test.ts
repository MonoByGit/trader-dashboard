import { readFileSync } from 'node:fs';
import { makeBars } from '../momentum2/fixtures';
import { newBook } from '../momentum2/book';
import { simulateVersion } from '../momentum2/simulate';
import { sharpeFromEquity, summarizeBacktest } from './backtest-metrics';
import { M4_BUDGET_PCT, m4Version } from './config';
import { dedupe13FByReport, parse13FInfoTableXml, staticCusipResolver } from './edgar';
import { diffHoldings, mergeFundSignals, signalsByFiledDate, type HoldingsSnapshot } from './holdings';
import { buildBasketTargets, basketSignalsByFiledDate, filterNewPositionsOnly } from './basket';
import { buildM4Signals } from './signals-build';
import { alignSignalsToTradingDays } from './trading-days';
import { makeM4Hooks, planM4 } from './plan';
import { walkForwardM4 } from './walkforward';

const snap = (asOf: string, filedAt: string, cik: string, h: Array<[string, number, number]>): HoldingsSnapshot => ({
  asOf,
  filedAt,
  fund: cik,
  cik,
  holdings: h.map(([symbol, shares, weightPct]) => ({ symbol, shares, weightPct })),
});

describe('13F parser', () => {
  const xml = readFileSync(new URL('./fixtures/berkshire-q1.xml', import.meta.url), 'utf8');
  it('aggregeert CUSIP-rijen en mapt via resolver', async () => {
    const raw = parse13FInfoTableXml(xml);
    expect(raw).toHaveLength(2);
    const resolver = staticCusipResolver({ '037833100': 'AAPL', '025816109': 'AXP' });
    const symbols = await Promise.all(raw.map((r) => resolver.resolve(r.cusip)));
    expect(symbols).toEqual(['AAPL', 'AXP']);
  });
  it('dedupe houdt laatste filing per rapportperiode', () => {
    const d = dedupe13FByReport([
      { accessionNumber: 'a', form: '13F-HR', filingDate: '2024-05-15', reportDate: '2024-03-31' },
      { accessionNumber: 'b', form: '13F-HR/A', filingDate: '2024-06-01', reportDate: '2024-03-31' },
      { accessionNumber: 'c', form: '13F-HR', filingDate: '2024-08-14', reportDate: '2024-06-30' },
    ]);
    expect(d.map((x) => x.reportDate)).toEqual(['2024-03-31', '2024-06-30']);
    expect(d[0]!.filingDate).toBe('2024-06-01');
  });
});

describe('holdings diff', () => {
  const a = snap('2024-03-31', '2024-05-15', '1', [['TSLA', 1000, 10], ['COIN', 1000, 8], ['OLD', 500, 2]]);
  const b = snap('2024-06-30', '2024-08-14', '1', [['TSLA', 1100, 10.5], ['COIN', 400, 3], ['NEW', 300, 1]]);
  it('opening, toevoeging, vermindering en sluiting op filedAt', () => {
    const d = Object.fromEntries(diffHoldings(a, b).map((x) => [x.symbol, x.kind]));
    expect(d).toEqual({ TSLA: 'add', COIN: 'reduce', NEW: 'open', OLD: 'close' });
    const byDate = signalsByFiledDate([a, b]);
    expect(Object.keys(byDate)).toEqual(['2024-08-14']);
  });
  it('negeert ruis onder 0,5%', () => {
    expect(diffHoldings(a, snap('2024-06-30', '2024-08-14', '1', [['TSLA', 1002, 10], ['COIN', 1000, 8], ['OLD', 500, 2]]))).toEqual([]);
  });
  it('merge per fonds', () => {
    const f2a = snap('2024-03-31', '2024-05-15', '2', [['SPY', 100, 50]]);
    const f2b = snap('2024-06-30', '2024-08-14', '2', [['SPY', 200, 60]]);
    const m = mergeFundSignals([[a, b], [f2a, f2b]]);
    expect(m['2024-08-14']?.length).toBeGreaterThan(1);
  });
});

describe('config', () => {
  it('5% budget, 15% verlieslimiet, stops', () => {
    const c = m4Version(100_000);
    expect(c.budgetUsd).toBeCloseTo(100_000 * M4_BUDGET_PCT, 6);
    expect(c.id).toBe('m4-copy');
    expect(c.maxLossPct).toBe(0.15);
  });
});

describe('trading day align', () => {
  it('schuift weekend-filedAt naar volgende sessie', () => {
    const spy = ['2024-05-13', '2024-05-14', '2024-05-15'];
    const out = alignSignalsToTradingDays(
      { '2024-05-12': [{ symbol: 'X', kind: 'open', changePct: 100, weightPct: 5, sourceFund: '1' }] },
      spy,
    );
    expect(out['2024-05-13']).toHaveLength(1);
  });
});

describe('basket', () => {
  const f1a = snap('2024-03-31', '2024-05-15', '1', [['AAPL', 100, 40], ['MSFT', 50, 20]]);
  const f1b = snap('2024-06-30', '2024-08-14', '1', [['AAPL', 100, 40], ['MSFT', 50, 20]]);
  const f2a = snap('2024-03-31', '2024-05-20', '2', [['AAPL', 80, 30], ['GOOG', 60, 25]]);
  it('conviction top-N over fondsen', () => {
    const t = buildBasketTargets([f1b, f2a], 2, 'conviction');
    expect(t.map((x) => x.symbol)).toEqual(['AAPL', 'GOOG']);
    expect(t[0]!.allocPct).toBeGreaterThan(t[1]!.allocPct);
  });
  it('equal weight onder top-N', () => {
    const t = buildBasketTargets([f1b, f2a], 2, 'equal');
    expect(t[0]!.allocPct).toBeCloseTo(0.5, 6);
    expect(t[1]!.allocPct).toBeCloseTo(0.5, 6);
  });
  it('new-only filter', () => {
    const merged = mergeFundSignals([[f1a, f1b], [f2a]]);
    const n = filterNewPositionsOnly(merged);
    for (const sigs of Object.values(n)) expect(sigs.every((s) => s.kind === 'open')).toBe(true);
  });
  it('mandje-signalen op filing-dagen', () => {
    const sig = basketSignalsByFiledDate([[f1a, f1b], [f2a]], 3, 'equal');
    expect(Object.keys(sig).length).toBeGreaterThan(0);
  });
});

describe('plan', () => {
  const cfg = m4Version(100_000, ['TSLA', 'COIN', 'NEW']);
  const bars = { SPY: makeBars(10, 100, 0), TSLA: makeBars(10, 200, 0), COIN: makeBars(10, 100, 0), NEW: makeBars(10, 50, 0) };
  it('kopieert opening en grote toevoeging', () => {
    const book = newBook(cfg, null, null);
    const o = planM4({
      signals: [
        { symbol: 'TSLA', kind: 'add', changePct: 10, weightPct: 10, sourceFund: 'brk' },
        { symbol: 'COIN', kind: 'add', changePct: 2, weightPct: 8, sourceFund: 'brk' },
        { symbol: 'NEW', kind: 'open', changePct: 100, weightPct: 1, sourceFund: 'brk' },
      ],
      barsBySymbol: bars,
      book,
      cfg,
    }).orders;
    expect(o.map((x) => x.symbol).sort()).toEqual(['NEW', 'TSLA']);
  });
  it('new-only: geen 13F-verkoop', () => {
    const book = newBook({ ...cfg, variant: 'new-only' }, null, null);
    book.positions.TSLA = { qty: 3, entryPrice: 200, entryDate: '2026-10-01', highWater: 200 };
    const o = planM4({
      signals: [{ symbol: 'TSLA', kind: 'close', changePct: -100, weightPct: 0, sourceFund: 'brk' }],
      barsBySymbol: bars,
      book,
      cfg: { ...cfg, variant: 'new-only' },
    }).orders;
    expect(o).toHaveLength(0);
  });
  it('sluit bij close of grote reduce', () => {
    const book = newBook(cfg, null, null);
    book.positions.TSLA = { qty: 3, entryPrice: 200, entryDate: '2026-10-01', highWater: 200 };
    const o = planM4({
      signals: [{ symbol: 'TSLA', kind: 'close', changePct: -100, weightPct: 0, sourceFund: 'brk' }],
      barsBySymbol: bars,
      book,
      cfg,
    }).orders;
    expect(o[0]).toMatchObject({ side: 'sell', symbol: 'TSLA' });
  });
});

describe('simulate & walk-forward', () => {
  it('walk-forward OOS samenvatting', async () => {
    const n = 400;
    const spy = makeBars(n, 100, 0.0003);
    const sym = makeBars(n, 50, 0.001);
    const dates = spy.map((b) => b.t.slice(0, 10));
    const sig: Record<string, typeof sym extends never ? never : import('./holdings').CopySignal[]> = {};
    sig[dates[120]!] = [{ symbol: 'ABC', kind: 'open', changePct: 100, weightPct: 5, sourceFund: '1' }];
    sig[dates[280]!] = [{ symbol: 'ABC', kind: 'close', changePct: -100, weightPct: 0, sourceFund: '1' }];
    const cfg = m4Version(100_000, ['ABC']);
    const data = { benchmark: spy, barsBySymbol: { SPY: spy, ABC: sym } };
    const wf = await walkForwardM4({
      cfg,
      data,
      signalsByDate: sig,
      grid: [{ minAddPct: 5 }, { minAddPct: 10 }],
      trainDays: 120,
      testDays: 60,
    });
    expect(wf.windows.length).toBeGreaterThan(0);
    expect(Number.isFinite(wf.oos.sharpe)).toBe(true);
    expect(wf.oos.periodEnd.length).toBeGreaterThan(0);
    expect(wf.oos.trades).toBeGreaterThan(0);
  });
});

describe('backtest metrics', () => {
  it('sharpe op flat curve is 0', () => {
    const rows = [{ date: 'a', equity: 100, cash: 0, exposure: 100, spyEquity: 100, excessVsSpyPct: 0 }];
    expect(sharpeFromEquity(rows)).toBe(0);
  });
});
