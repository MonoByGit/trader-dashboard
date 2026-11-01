import { jest } from '@jest/globals';
import { applyBuy, applySell, equityOf, logRow, newBook } from './book';
import { MOMENTUM2_BASE } from './config';
import { makeBars } from './fixtures';
import { planRebalance } from './plan';
import { checkStop, lossLimitBreached, sizingBase, stopLevel } from './risk';
import { rankUniverse, targetWeights } from './signals';
import { simulateVersion, simulateVersions } from './simulate';
import { makeVeto, parseVetoResponse } from './veto';
import type { VersionConfig } from './types';

const cfg: VersionConfig = { ...MOMENTUM2_BASE, universe: ['AAA', 'BBB', 'CCC', 'DDD'], topN: 2, lookbackDays: 20, smaDays: 50, volDays: 10 };

function universe() {
  return {
    AAA: makeBars(120, 100, 0.004, 0.01), // sterke stijger
    BBB: makeBars(120, 100, 0.002, 0.03), // zwakker en volatieler
    CCC: makeBars(120, 100, -0.003, 0.01), // daler: valt af op trendfilter
    DDD: makeBars(30, 100, 0.01), // te weinig historie
  };
}

describe('signals', () => {
  it('filtert op 200d-achtig trendfilter, absoluut momentum en historie', () => {
    const r = rankUniverse(universe(), cfg).map((x) => x.symbol);
    expect(r).toContain('AAA');
    expect(r).not.toContain('CCC');
    expect(r).not.toContain('DDD');
    expect(r[0]).toBe('AAA');
  });

  it('gewichten tellen op tot 1 en het rustigste ETF krijgt het meeste gewicht', () => {
    const w = targetWeights(universe(), cfg);
    expect(w.reduce((a, x) => a + x.weight, 0)).toBeCloseTo(1, 10);
    const a = w.find((x) => x.symbol === 'AAA')!;
    const b = w.find((x) => x.symbol === 'BBB')!;
    expect(a.vol).toBeLessThan(b.vol);
    expect(a.weight).toBeGreaterThan(b.weight);
  });

  it('niets valt door het filter = alles cash', () => {
    const down = { AAA: makeBars(120, 100, -0.004, 0.01) };
    expect(targetWeights(down, { ...cfg, universe: ['AAA'] })).toEqual([]);
  });
});

describe('risk', () => {
  it('stopniveau: harde stop bij entry, trailing neemt over na winst', () => {
    expect(stopLevel({ entryPrice: 100, highWater: 100 }, cfg)).toEqual({ level: 92, kind: 'hard' });
    const s = stopLevel({ entryPrice: 100, highWater: 130 }, cfg);
    expect(s.kind).toBe('trailing');
    expect(s.level).toBeCloseTo(117, 6);
  });

  it('stop vult op de stop, of op de open bij een gap eronder', () => {
    const pos = { entryPrice: 100, highWater: 100 };
    expect(checkStop(pos, { o: 99, l: 95 }, cfg)).toEqual({ hit: false });
    expect(checkStop(pos, { o: 99, l: 90 }, cfg)).toEqual({ hit: true, fillPrice: 92, kind: 'hard' });
    expect(checkStop(pos, { o: 85, l: 84 }, cfg)).toEqual({ hit: true, fillPrice: 85, kind: 'hard' });
  });

  it('verliesgrens en meebewegend budget', () => {
    const book = newBook(cfg, null, null);
    expect(lossLimitBreached(4250, book, cfg)).toBe(true);
    expect(lossLimitBreached(4300, book, cfg)).toBe(false);
    expect(sizingBase(6000, book, cfg)).toBe(6000);
    expect(sizingBase(6000, book, { ...cfg, floatingBudget: false })).toBe(5000);
    expect(sizingBase(4000, book, { ...cfg, floatingBudget: false })).toBe(4000);
  });
});

describe('book', () => {
  it('koop en verkoop boeken cash en pnl, en loggen versus SPY', () => {
    const book = newBook(cfg, '2024-01-01', 100);
    expect(applyBuy(book, 'AAA', 10, 100, '2024-01-02', 'x')).not.toBeNull();
    expect(book.cash).toBe(4000);
    expect(applyBuy(book, 'AAA', 1000, 100, '2024-01-02', 'x')).toBeNull(); // te weinig cash
    const row = logRow(book, '2024-01-03', { AAA: 110 }, 105);
    expect(row.equity).toBe(5100);
    expect(row.spyEquity).toBeCloseTo(5250, 6);
    expect(row.excessVsSpyPct).toBeCloseTo(2 - 5, 6);
    const t = applySell(book, 'AAA', 10, 110, '2024-01-03', 'y')!;
    expect(t.pnl).toBe(100);
    expect(equityOf(book, {})).toBe(5100);
  });
});

describe('plan', () => {
  it('koopt de top en verkoopt wat uit de top valt, verkopen eerst', async () => {
    const book = newBook(cfg, null, null);
    book.cash = 0;
    book.positions.CCC = { qty: 10, entryPrice: 100, entryDate: '2024-01-01', highWater: 100 };
    book.cash = 4000;
    const p = await planRebalance({ barsBySymbol: universe(), book, cfg });
    expect(p.orders[0]).toMatchObject({ symbol: 'CCC', side: 'sell' });
    expect(p.orders.filter((o) => o.side === 'buy').map((o) => o.symbol).sort()).toEqual(['AAA', 'BBB']);
  });

  it('veto verwijdert alleen een nieuwe instap en verschuift het gewicht niet', async () => {
    const book = newBook(cfg, null, null);
    const veto = jest.fn(async (c: { symbol: string }) => ({
      veto: c.symbol === 'BBB', reason: 'test', model: 'deepseek-x', modelVersion: '1',
    }));
    const p = await planRebalance({ barsBySymbol: universe(), book, cfg, veto });
    expect(p.orders.map((o) => o.symbol)).toEqual(['AAA']);
    const w = targetWeights(universe(), cfg).find((x) => x.symbol === 'AAA')!.weight;
    expect(p.orders[0]!.notionalUsd).toBeCloseTo(5000 * w, 6);
    expect(p.vetoes).toHaveLength(2);
  });

  it('veto raakt gehouden posities niet', async () => {
    const book = newBook(cfg, null, null);
    book.positions.AAA = { qty: 5, entryPrice: 100, entryDate: '2024-01-01', highWater: 100 };
    const veto = jest.fn(async () => ({ veto: true, reason: 'nee', model: 'm', modelVersion: '1' }));
    const p = await planRebalance({ barsBySymbol: universe(), book, cfg, veto });
    expect(veto).toHaveBeenCalledTimes(1); // alleen BBB
    expect(p.orders.some((o) => o.symbol === 'AAA' && o.side === 'sell' && o.reason.startsWith('rotatie'))).toBe(false);
  });

  it('gehalte versie verkoopt alles en koopt niets', async () => {
    const book = newBook(cfg, null, null);
    book.halted = true;
    book.positions.AAA = { qty: 5, entryPrice: 100, entryDate: '2024-01-01', highWater: 100 };
    const p = await planRebalance({ barsBySymbol: universe(), book, cfg });
    expect(p.orders).toEqual([expect.objectContaining({ symbol: 'AAA', side: 'sell', qty: 5 })]);
  });
});

describe('veto', () => {
  const meta = { model: 'deepseek-chat', modelVersion: 'v3.1' };
  it('parset JSON en logt model en versie', () => {
    expect(parseVetoResponse('```json\n{"veto":true,"reason":"event"}\n```', meta)).toEqual({ veto: true, reason: 'event', ...meta });
  });
  it('onleesbaar of fout = geen veto, gemarkeerd', async () => {
    expect(parseVetoResponse('geen idee', meta)).toMatchObject({ veto: false, failedOpen: true, ...meta });
    const v = makeVeto(async () => { throw new Error('timeout'); }, meta);
    expect(await v({ symbol: 'A', momentum: 1, weight: 1, lastClose: 1, sma: 1 })).toMatchObject({ veto: false, failedOpen: true });
  });
});

describe('simulate', () => {
  const data = () => ({ barsBySymbol: { ...universe(), SPY: makeBars(120, 100, 0.001, 0.01) }, benchmark: makeBars(120, 100, 0.001, 0.01) });
  const c = { ...cfg, universe: ['AAA', 'BBB', 'CCC'], smaDays: 50 };

  it('draait, beweegt over nacht en logt versus SPY', async () => {
    const r = await simulateVersion(c, data());
    expect(r.equity.length).toBe(70);
    expect(r.trades.some((t) => t.side === 'buy')).toBe(true);
    expect(r.equity[0]!.excessVsSpyPct).toBeCloseTo(0, 6);
    expect(r.metrics.spyReturnPct).toBeGreaterThan(0);
    for (const row of r.equity) expect(row.equity).toBeGreaterThan(0);
  });

  it('geen lookahead: eerste koop is op de open NA de eerste beslisdag', async () => {
    const r = await simulateVersion(c, data());
    const firstBuy = r.trades.find((t) => t.side === 'buy')!;
    expect(firstBuy.date).toBe(r.equity[1]!.date);
  });

  it('crash: verliesgrens of stop sluit alles en houdt de versie dicht', async () => {
    // Gap-down van 30% op dag 100: de stop vult op de (slechtere) open, de verliesgrens sluit de versie.
    const crash = makeBars(120, 100, 0.003, 0);
    for (let i = 100; i < 120; i++) {
      const b = crash[i]!;
      crash[i] = { ...b, o: b.o * 0.7, h: b.h * 0.7, l: b.l * 0.7, c: b.c * 0.7 };
    }
    const d = { barsBySymbol: { AAA: crash }, benchmark: makeBars(120, 100, 0.001) };
    const r = await simulateVersion({ ...c, universe: ['AAA'], topN: 1, maxLossPct: 0.05 }, d);
    expect(r.book.halted).toBe(true);
    expect(Object.keys(r.book.positions)).toHaveLength(0);
    expect(r.trades.some((t) => t.side === 'sell' && /stop|dicht/.test(t.reason))).toBe(true);
  });

  it('versies zijn onafhankelijk: eigen budget en boek', async () => {
    const [a, b] = await simulateVersions([c, { ...c, id: 'x2', budgetUsd: 20000 }], data());
    expect(a!.book.startBudgetUsd).toBe(5000);
    expect(b!.book.startBudgetUsd).toBe(20000);
    expect(b!.equity[0]!.equity).toBe(20000);
    expect(b!.metrics.totalReturnPct).toBeCloseTo(a!.metrics.totalReturnPct, -1);
  });
});
