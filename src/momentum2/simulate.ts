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
  hooks?: StrategyHooks<any>;
  veto?: VetoFn;
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

/** Een versie door de tijd. Besluit op de close van dag i, uitvoering op de open van dag i+1 (over nacht). */
export async function simulateVersion<C extends VersionConfig>(cfg: C, data: SimData, opts: SimOptions = {}): Promise<SimResult> {
  const hooks = (opts.hooks ?? rotationHooks) as StrategyHooks<C>;
  const slip = ((opts.slippageBps ?? 2) + (cfg.feeBps ?? 0)) / 10000;
  const dates = data.benchmark.map(dateOf);
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
  const book = newBook(cfg, dates[startI] ?? null, data.benchmark[startI]?.c ?? null);
  const trades: TradeLogRow[] = [];
  const equity: EquityLogRow[] = [];
  const vetoLog: SimResult['vetoLog'] = [];
  let pending: OrderIntent[] = [];
  let peakEq = cfg.budgetUsd;
  let maxDd = 0;

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
      if (!bar) continue;
      const st = hooks.stopFor(pos, cfg);
      const r = checkStopLevel(st.level, st.kind, bar);
      if (r.hit) {
        const t = applySell(book, sym, pos.qty, r.fillPrice * (1 - slip), date, `${r.kind} stop`);
        if (t) trades.push(t);
      } else {
        pos.highWater = Math.max(pos.highWater, bar.h);
      }
    }

    // 3. Waardering, drawdown, verliesgrens.
    const prices: Record<string, number> = {};
    for (const sym of Object.keys(book.positions)) prices[sym] = barAt(sym, date)?.c ?? book.positions[sym]!.entryPrice;
    const eq = equityOf(book, prices);
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
  const ret = last ? (last.equity / cfg.budgetUsd - 1) * 100 : 0;
  const spyRet = last ? (last.spyEquity / cfg.budgetUsd - 1) * 100 : 0;
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
