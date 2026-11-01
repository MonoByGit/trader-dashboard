import { applyBuy, applySell, equityOf, logRow, newBook } from './book';
import { dateOf } from './indicators';
import { rotationHooks, type StrategyHooks } from './hooks';
import { checkStopLevel, lossLimitBreached } from './risk';
import type { Bar, EquityLogRow, OrderIntent, TradeLogRow, VersionBook, VersionConfig, VetoFn, VetoVerdict } from './types';

export interface SimData {
  barsBySymbol: Record<string, Bar[]>;
  benchmark: Bar[]; // SPY
}

export interface SimOptions {
  slippageBps?: number;
  /** Vul ontbrekende dagen in de bars op met een vlakke bar (vorige slot, volume 0), tegen gaten in crypto-data. */
  fillGaps?: boolean;
  hooks?: StrategyHooks<any>;
  veto?: VetoFn;
  /** Doorlopend boek (walk-forward / live); verliesgrens blijft t.o.v. startBudgetUsd. */
  initialBook?: VersionBook;
}

export interface SimResult {
  versionId: string;
  trades: TradeLogRow[];
  equity: EquityLogRow[];
  vetoLog: Array<{ date: string; symbol: string; verdict: VetoVerdict }>;
  book: VersionBook;
  metrics: {
    totalReturnPct: number;
    spyReturnPct: number;
    excessVsSpyPct: number;
    maxDrawdownPct: number;
    tradeCount: number;
    halted: boolean;
  };
}

/** Zet bars op de kalender: ontbrekende dagen na de eerste bar krijgen een vlakke bar op het vorige slot. */
export function fillGaps(bars: Bar[], dates: string[]): Bar[] {
  if (bars.length === 0) return bars;
  const byDate = new Map(bars.map((b) => [dateOf(b), b]));
  const first = dateOf(bars[0]!);
  const out: Bar[] = [];
  let prev: Bar | null = null;
  for (const d of dates) {
    if (d < first) continue;
    const b = byDate.get(d);
    if (b) { out.push(b); prev = b; }
    else if (prev) out.push({ t: d, o: prev.c, h: prev.c, l: prev.c, c: prev.c, v: 0 });
  }
  return out;
}

/** Een versie door de tijd. Besluit op de close van dag i, uitvoering op de open van dag i+1 (over nacht). */
export async function simulateVersion<C extends VersionConfig>(cfg: C, data: SimData, opts: SimOptions = {}): Promise<SimResult> {
  const hooks = (opts.hooks ?? rotationHooks) as StrategyHooks<C>;
  const slip = ((opts.slippageBps ?? 2) + (cfg.feeBps ?? 0)) / 10000;
  const dates = data.benchmark.map(dateOf);
  if (opts.fillGaps) data = { ...data, barsBySymbol: Object.fromEntries(Object.entries(data.barsBySymbol).map(([s, b]) => [s, fillGaps(b, dates)])) };
  const idx: Record<string, Map<string, number>> = {};
  for (const [s, bars] of Object.entries(data.barsBySymbol)) {
    idx[s] = new Map(bars.map((b, i) => [dateOf(b), i]));
  }
  const barAt = (s: string, date: string): Bar | null => {
    const i = idx[s]?.get(date);
    return i === undefined ? null : data.barsBySymbol[s]![i]!;
  };
  const upTo = (date: string): Record<string, Bar[]> => {
    const out: Record<string, Bar[]> = {};
    for (const s of Object.keys(data.barsBySymbol)) {
      const i = idx[s]!.get(date);
      if (i !== undefined) out[s] = data.barsBySymbol[s]!.slice(0, i + 1);
    }
    return out;
  };

  const startI = cfg.smaDays; // genoeg historie voor het 200d filter
  const book =
    opts.initialBook != null
      ? structuredClone(opts.initialBook)
      : newBook(cfg, dates[startI] ?? null, data.benchmark[startI]?.c ?? null);
  // Walk-forward vensters hebben een eigen dag-index; absolute lastRebalanceIndex uit het vorige venster blokkeert plannen.
  if (opts.initialBook != null) {
    book.lastRebalanceIndex = null;
    delete book.lastDecisionDate;
  }
  const trades: TradeLogRow[] = [];
  const equity: EquityLogRow[] = [];
  const vetoLog: SimResult['vetoLog'] = [];
  let pending: OrderIntent[] = [];
  let peakEq = book.peakEquity;
  let maxDd = 0;
  const gapMiss: Record<string, { miss: number; lastClose: number }> = {};

  const markPrices = (date: string): Record<string, number> => {
    const prices: Record<string, number> = {};
    for (const sym of Object.keys(book.positions)) {
      const bar = barAt(sym, date);
      if (bar) {
        gapMiss[sym] = { miss: 0, lastClose: bar.c };
        prices[sym] = bar.c;
      } else {
        const g = gapMiss[sym];
        prices[sym] = g?.lastClose ?? book.positions[sym]!.entryPrice;
      }
    }
    return prices;
  };

  let equityStart = cfg.budgetUsd;
  if (opts.initialBook != null && dates[startI]) {
    equityStart = equityOf(book, markPrices(dates[startI]!));
  }

  for (let i = startI; i < dates.length; i++) {
    const date = dates[i]!;

    // 1. Uitvoeren van gisteren genomen orders op de open (verkopen eerst).
    for (const o of pending) {
      const bar = barAt(o.symbol, date);
      if (!bar) continue;
      if (o.side === 'sell') {
        const t = applySell(book, o.symbol, o.qty ?? 0, bar.o * (1 - slip), date, o.reason);
        if (t) trades.push(t);
      } else {
        const px = bar.o * (1 + slip);
        const whole = (x: number) => (cfg.fractional ? Math.floor(x * 1e6) / 1e6 : Math.floor(x));
        const qty = Math.min(whole((o.notionalUsd ?? 0) / px), whole(book.cash / px));
        const t = applyBuy(book, o.symbol, qty, px, date, o.reason);
        if (t) trades.push(t);
      }
    }
    pending = [];

    // 2. Stops (stand van vóór vandaag; nieuwe posities hebben hun harde stop vanaf de fill).
    for (const [sym, pos] of Object.entries(book.positions)) {
      const bar = barAt(sym, date);
      if (!bar) {
        const g = gapMiss[sym] ?? { miss: 0, lastClose: pos.entryPrice };
        g.miss += 1;
        gapMiss[sym] = g;
        if (g.miss >= 3) {
          pending.push({ symbol: sym, side: 'sell', qty: pos.qty, reason: 'datagat: te lang geen bar' });
        }
        continue;
      }
      gapMiss[sym] = { miss: 0, lastClose: bar.c };
      const hist = upTo(date)[sym];
      const st = hooks.stopFor(pos, cfg, hist);
      const r = checkStopLevel(st.level, st.kind, bar);
      if (r.hit) {
        const t = applySell(book, sym, pos.qty, r.fillPrice * (1 - slip), date, `${r.kind} stop`);
        if (t) trades.push(t);
      } else {
        pos.highWater = Math.max(pos.highWater, bar.h);
      }
    }

    // 3. Waardering, drawdown, verliesgrens.
    const prices = markPrices(date);
    const eq = equityOf(book, prices);
    book.peakEquity = Math.max(book.peakEquity, eq);
    peakEq = Math.max(peakEq, eq);
    maxDd = Math.max(maxDd, (peakEq - eq) / peakEq);
    equity.push(logRow(book, date, prices, data.benchmark[i]!.c));
    if (!book.halted && lossLimitBreached(eq, book, cfg)) {
      book.halted = true;
      book.haltReason = `verliesgrens ${(cfg.maxLossPct * 100).toFixed(0)}% geraakt op ${date}`;
    }

    // 4. Besluit voor morgen.
    const due = book.lastRebalanceIndex === null || i - book.lastRebalanceIndex >= cfg.rebalanceEveryDays;
    if (book.halted || due) {
      const plan = await hooks.plan({ barsBySymbol: upTo(date), book, cfg, veto: opts.veto });
      pending = plan.orders;
      for (const v of plan.vetoes) vetoLog.push({ date, symbol: v.symbol, verdict: v.verdict });
      if (!book.halted) book.lastRebalanceIndex = i;
    }
  }

  const last = equity[equity.length - 1];
  const spyStart = dates[startI] ? data.benchmark[startI]!.c : null;
  const spyEnd = last ? data.benchmark.find((b) => dateOf(b) === last.date)?.c ?? null : null;
  const ret = last ? (last.equity / equityStart - 1) * 100 : 0;
  const spyRet =
    spyStart && spyEnd && spyStart > 0 ? (spyEnd / spyStart - 1) * 100 : last ? (last.spyEquity / book.startBudgetUsd - 1) * 100 : 0;
  return {
    versionId: cfg.id,
    trades,
    equity,
    vetoLog,
    book,
    metrics: {
      totalReturnPct: ret,
      spyReturnPct: spyRet,
      excessVsSpyPct: ret - spyRet,
      maxDrawdownPct: maxDd * 100,
      tradeCount: trades.length,
      halted: book.halted,
    },
  };
}

/** Alle versies naast elkaar, volledig onafhankelijk (eigen boek, budget en verliesgrens). */
export async function simulateVersions<C extends VersionConfig>(cfgs: C[], data: SimData, opts: SimOptions = {}): Promise<SimResult[]> {
  const out: SimResult[] = [];
  for (const c of cfgs) out.push(await simulateVersion(c, data, opts));
  return out;
}
