import { makeBars } from '../momentum2/fixtures';
import { simulateVersion } from '../momentum2/simulate';
import { newBook } from '../momentum2/book';
import type { Bar } from '../momentum2/types';
import { m3Grid, m3Versions, M3_BUDGET_PCT, trailLocksProfit } from './config';
import { fillGaps } from '../momentum2/simulate';
import { m3Hooks, planM3 } from './plan';
import { m3StopLevel } from './risk';
import { entryCandidates } from './signals';
import { walkForward } from './walkforward';

const [crypto, etf] = m3Versions(100_000);

/** Reeks: stijgt, dipt scherp (RSI < 30), draait dan omhoog. */
function dipThenTurn(n: number, dipAt: number): Bar[] {
  const bars = makeBars(n, 100, 0.001);
  let f = 1;
  return bars.map((b, i) => {
    if (i >= dipAt && i < dipAt + 8) f *= 0.96;
    else if (i >= dipAt + 8 && i < dipAt + 12) f *= 1.02;
    else if (i >= dipAt + 12) f *= 1.003;
    return { ...b, o: b.o * f, h: b.h * f, l: b.l * f, c: b.c * f };
  });
}

describe('config', () => {
  it('budget = 10% van het paperkapitaal, crypto hooguit de helft, verlieslimiet 15%', () => {
    expect(crypto!.budgetUsd + etf!.budgetUsd).toBeCloseTo(100_000 * M3_BUDGET_PCT, 6);
    expect(crypto!.budgetUsd).toBeLessThanOrEqual((crypto!.budgetUsd + etf!.budgetUsd) / 2);
    expect(crypto!.maxLossPct).toBe(0.15);
    expect(etf!.maxLossPct).toBe(0.15);
    expect(crypto!.topN).toBe(3);
  });
});

describe('risk', () => {
  it('harde stop 7% bij entry, trailing pas vanaf +10% en daarna alleen omhoog', () => {
    const p = { entryPrice: 100, highWater: 100 };
    expect(m3StopLevel(p, crypto!)).toEqual({ level: 93, kind: 'hard' });
    expect(m3StopLevel({ ...p, highWater: 108 }, crypto!)).toEqual({ level: 93, kind: 'hard' });
    const t = m3StopLevel({ ...p, highWater: 112 }, crypto!);
    expect(t.kind).toBe('trailing');
    expect(t.level).toBeCloseTo(103.04, 1);
    expect(m3StopLevel({ ...p, highWater: 120 }, crypto!).level).toBeGreaterThan(t.level);
  });
  it('de eerste trailing-uitstap staat altijd in de plus (geen break-even-uitstappen), ook in het hele raster', () => {
    expect(trailLocksProfit(crypto!)).toBe(true);
    expect(trailLocksProfit(etf!)).toBe(true);
    expect(trailLocksProfit({ trailActivatePct: 0.05, trailingStopPct: 0.05 })).toBe(false);
    for (const c of [crypto!, etf!]) {
      const grid = m3Grid(c);
      expect(grid.length).toBeGreaterThan(10);
      for (const p of grid) expect(trailLocksProfit({ ...c, ...p })).toBe(true);
    }
  });
});

describe('signals', () => {
  const cfg = { ...crypto!, universe: ['X'] };
  it('koopt na dip onder RSI 30 zodra de koers draait', () => {
    const bars = dipThenTurn(80, 40);
    let hit = -1;
    for (let i = 20; i < bars.length; i++) {
      if (entryCandidates({ X: bars.slice(0, i + 1) }, cfg).length) { hit = i; break; }
    }
    expect(hit).toBeGreaterThanOrEqual(46); // pas tijdens/na de dip
    expect(hit).toBeLessThan(60);
  });
  it('geen instap in een rustige stijger (nooit bewapend)', () => {
    expect(entryCandidates({ X: makeBars(80, 100, 0.002) }, cfg)).toEqual([]);
  });
  it('ETF vereist de trend: dip onder het 200d gemiddelde geeft geen instap', () => {
    const down = makeBars(260, 100, -0.002);
    const e = { ...etf!, universe: ['X'], rsiTrigger: 100 }; // RSI altijd 'bewapend'
    expect(entryCandidates({ X: down }, e)).toEqual([]);
  });
});

describe('plan', () => {
  it('maximaal 3 posities en positiegrootte = positionPct van het budget', () => {
    const u = ['A', 'B', 'C', 'D'];
    const bars = Object.fromEntries(u.map((s) => [s, dipThenTurn(80, 40)]));
    const cfg = { ...crypto!, universe: u };
    const book = newBook(cfg, null, null);
    let orders = planM3({ barsBySymbol: {}, book, cfg }).orders;
    for (let i = 46; i < 70 && orders.length === 0; i++) {
      orders = planM3({ barsBySymbol: Object.fromEntries(u.map((s) => [s, bars[s]!.slice(0, i + 1)])), book, cfg }).orders;
    }
    expect(orders.length).toBe(3);
    expect(orders[0]!.notionalUsd).toBeCloseTo(cfg.budgetUsd / 3, 6);
  });
  it('gehalte versie verkoopt alles', () => {
    const book = newBook(crypto!, null, null);
    book.halted = true;
    book.positions['BTC/USD'] = { qty: 0.5, entryPrice: 100, entryDate: '2024-01-01', highWater: 100 };
    expect(planM3({ barsBySymbol: {}, book, cfg: crypto! }).orders).toEqual([expect.objectContaining({ side: 'sell', qty: 0.5 })]);
  });
});

describe('simulate crypto', () => {
  const sym = 'X';
  const cfg = { ...crypto!, universe: [sym], topN: 1, positionPct: 1 };
  const bench = makeBars(160, 100, 0.0005);

  it('koopt de dip, stapt uit op herstel en logt versus benchmark; fees gaan eraf', async () => {
    const r = await simulateVersion(cfg, { barsBySymbol: { [sym]: dipThenTurn(160, 60) }, benchmark: bench }, { hooks: m3Hooks });
    expect(r.trades.some((t) => t.side === 'buy')).toBe(true);
    expect(r.trades.some((t) => t.side === 'sell')).toBe(true);
    const buy = r.trades.find((t) => t.side === 'buy')!;
    expect(Number.isInteger(buy.qty)).toBe(false); // fractioneel
    const free = await simulateVersion({ ...cfg, feeBps: 0 }, { barsBySymbol: { [sym]: dipThenTurn(160, 60) }, benchmark: bench }, { hooks: m3Hooks });
    expect(free.metrics.totalReturnPct).toBeGreaterThan(r.metrics.totalReturnPct);
  });

  it('gap-crash: harde stop vult op de open, verliesgrens zet de versie automatisch uit', async () => {
    const bars = dipThenTurn(160, 60);
    for (let i = 74; i < 160; i++) {
      const b = bars[i]!;
      bars[i] = { ...b, o: b.o * 0.5, h: b.h * 0.5, l: b.l * 0.5, c: b.c * 0.5 };
    }
    const r = await simulateVersion(cfg, { barsBySymbol: { [sym]: bars }, benchmark: bench }, { hooks: m3Hooks });
    expect(r.trades.some((t) => t.side === 'sell' && /stop/.test(t.reason))).toBe(true);
    expect(r.book.halted).toBe(true);
    expect(Object.keys(r.book.positions)).toHaveLength(0);
    expect(r.trades.filter((t) => t.side === 'buy')).toHaveLength(1); // na de grens niets meer gekocht
  });

  it('verliesgrens 15%: na de grens geen nieuwe posities', async () => {
    const book = newBook(cfg, null, null);
    book.halted = true;
    const p = planM3({ barsBySymbol: { [sym]: dipThenTurn(160, 60).slice(0, 110) }, book, cfg });
    expect(p.orders.every((o) => o.side === 'sell')).toBe(true);
  });
});

describe('walk-forward', () => {
  it('draagt gehalte boek door naar het volgende testvenster', async () => {
    const sym = 'X';
    const cfg = { ...crypto!, universe: [sym], topN: 1, positionPct: 1 };
    const data = { barsBySymbol: { [sym]: dipThenTurn(120, 40) }, benchmark: makeBars(120, 100, 0.0005) };
    const halted = newBook(cfg, null, null);
    halted.halted = true;
    halted.haltReason = 'verliesgrens';
    halted.positions[sym] = { qty: 1, entryPrice: 50, entryDate: '2024-01-01', highWater: 50 };
    const r = await simulateVersion(cfg, data, { hooks: m3Hooks, initialBook: halted });
    expect(r.book.halted).toBe(true);
    expect(r.trades.filter((t) => t.side === 'buy')).toHaveLength(0);
    expect(r.trades.some((t) => t.side === 'sell')).toBe(true);
  });

  it('kiest op train en meet op test, samengesteld rendement per venster', async () => {
    const sym = 'X';
    const cfg = { ...crypto!, universe: [sym], topN: 1, positionPct: 1 };
    const bars = dipThenTurn(400, 60);
    const bench = makeBars(400, 100, 0.0005);
    const r = await walkForward({
      cfg, data: { barsBySymbol: { [sym]: bars }, benchmark: bench },
      grid: [{ rsiTrigger: 25 }, { rsiTrigger: 30 }, { rsiTrigger: 35 }],
      trainDays: 120, testDays: 60,
    });
    expect(r.windows.length).toBeGreaterThanOrEqual(2);
    for (const w of r.windows) expect(w.testStart > w.trainStart).toBe(true);
    const manual = r.windows.reduce((a, w) => a * (1 + w.testReturnPct / 100), 1);
    expect((manual - 1) * 100).toBeCloseTo(r.oosReturnPct, 6);
    expect(r.oosExcessPct).toBeCloseTo(r.oosReturnPct - r.oosBenchmarkPct, 6);
  });
});

describe('afkoelperiode', () => {
  it('geen heraankoop vlak na een uitstap in hetzelfde symbool', () => {
    const cfg = { ...crypto!, universe: ['X'], topN: 1, cooldownDays: 5 };
    const bars = dipThenTurn(80, 40);
    let i = 46;
    const book = newBook(cfg, null, null);
    for (; i < 70; i++) {
      if (planM3({ barsBySymbol: { X: bars.slice(0, i + 1) }, book, cfg }).orders.length) break;
    }
    const day = bars[i]!.t.slice(0, 10);
    book.lastExit = { X: day }; // zojuist uitgestapt
    expect(planM3({ barsBySymbol: { X: bars.slice(0, i + 1) }, book, cfg }).orders).toEqual([]);
    book.lastExit = { X: '2000-01-01' }; // lang geleden
    expect(planM3({ barsBySymbol: { X: bars.slice(0, i + 1) }, book, cfg }).orders.length).toBe(1);
  });
});

describe('gaten in de data', () => {
  it('vult ontbrekende dagen met een vlakke bar op het vorige slot', () => {
    const full = makeBars(10, 100, 0.01);
    const dates = full.map((b) => b.t.slice(0, 10));
    const holey = full.filter((_, i) => i !== 4 && i !== 5);
    const out = fillGaps(holey, dates);
    expect(out).toHaveLength(10);
    expect(out[4]).toMatchObject({ o: holey[3]!.c, c: holey[3]!.c, v: 0 });
    expect(out.map((b) => b.t.slice(0, 10))).toEqual(dates);
  });
  it('vult niet vóór de eerste bar (nieuwe coin)', () => {
    const full = makeBars(10, 100, 0.01);
    const dates = full.map((b) => b.t.slice(0, 10));
    expect(fillGaps(full.slice(3), dates)).toHaveLength(7);
  });
});

describe('walk-forward verliesgrens', () => {
  it('een gehalte versie blijft uit in de volgende vensters (zoals live)', async () => {
    const sym = 'X';
    const cfg = { ...crypto!, universe: [sym], topN: 1, positionPct: 1 };
    // Venstergeometrie: warm 30, train 120 -> eerste testvenster = dagen 150..209. Dip op 160, draai 168, crash op 174.
    const bars = dipThenTurn(520, 160);
    for (let i = 174; i < 520; i++) {
      const b = bars[i]!;
      bars[i] = { ...b, o: b.o * 0.4, h: b.h * 0.4, l: b.l * 0.4, c: b.c * 0.4 };
    }
    const data = { barsBySymbol: { [sym]: bars }, benchmark: makeBars(520, 100, 0.0005) };
    const args = { cfg, data, grid: [{ rsiTrigger: 30 }], trainDays: 120, testDays: 60 };
    const persist = await walkForward(args);
    const reset = await walkForward({ ...args, haltPersists: false });
    expect(persist.haltedOn).not.toBeNull();
    expect(persist.windows).toHaveLength(1);
    expect(reset.windows.length).toBeGreaterThan(1);
    expect(reset.haltedOn).toBeNull();
  });
});
