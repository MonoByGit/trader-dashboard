import { dateOf } from '../momentum2/indicators';
import { simulateVersion, type SimData } from '../momentum2/simulate';
import type { TradeLogRow, VersionBook } from '../momentum2/types';
import type { M3Config } from './config';
import { m3Hooks } from './plan';

export interface WalkForwardWindow {
  trainStart: string;
  testStart: string;
  testEnd: string;
  chosen: Partial<M3Config>;
  trainScore: number;
  testReturnPct: number;
  testBenchmarkPct: number;
  testMaxDrawdownPct: number;
  testTrades: number;
}

export interface WalkForwardResult {
  windows: WalkForwardWindow[];
  haltedOn: string | null;
  oosReturnPct: number;
  oosBenchmarkPct: number;
  oosExcessPct: number;
  oosMaxDrawdownPct: number;
  oosSharpe: number;
  oosTradeCount: number;
  oosWinRatePct: number;
  oosCostsPctOfBudget: number;
  oosPeriodStart: string;
  oosPeriodEnd: string;
}

function slice(data: SimData, fromDate: string, toDate: string): SimData {
  const cut = (bars: SimData['benchmark']) => bars.filter((b) => dateOf(b) >= fromDate && dateOf(b) <= toDate);
  return {
    benchmark: cut(data.benchmark),
    barsBySymbol: Object.fromEntries(Object.entries(data.barsBySymbol).map(([s, b]) => [s, cut(b)])),
  };
}

const score = (ret: number, dd: number) => ret - 0.5 * dd;

function sharpeFromEquity(daily: Array<{ date: string; equity: number }>): number {
  if (daily.length < 3) return 0;
  const rets: number[] = [];
  for (let i = 1; i < daily.length; i++) {
    const p = daily[i - 1]!.equity;
    if (p <= 0) continue;
    rets.push(daily[i]!.equity / p - 1);
  }
  if (rets.length < 2) return 0;
  const mean = rets.reduce((a, r) => a + r, 0) / rets.length;
  const var_ = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1);
  const sd = Math.sqrt(var_);
  return sd > 1e-12 ? (mean / sd) * Math.sqrt(252) : 0;
}

function estimateCostsPct(trades: TradeLogRow[], budgetUsd: number, feeBps: number, slippageBps = 2): number {
  const bps = (feeBps + slippageBps) / 10000;
  let costs = 0;
  for (const t of trades) costs += t.qty * t.price * bps;
  return budgetUsd > 0 ? (costs / budgetUsd) * 100 : 0;
}

export async function walkForward(input: {
  cfg: M3Config;
  data: SimData;
  grid: Array<Partial<M3Config>>;
  trainDays: number;
  testDays: number;
  slippageBps?: number;
  haltPersists?: boolean;
}): Promise<WalkForwardResult> {
  const { cfg, data, grid, trainDays, testDays, slippageBps = 2 } = input;
  const persist = input.haltPersists ?? true;
  const fill = cfg.kind === 'crypto';
  const dates = data.benchmark.map(dateOf);
  const warm = cfg.smaDays;
  const windows: WalkForwardWindow[] = [];
  let oos = 1;
  let bench = 1;
  let carryBook: VersionBook | undefined;
  let haltedOn: string | null = null;
  let globalPeak = cfg.budgetUsd;
  let globalMaxDd = 0;
  const equityPath: Array<{ date: string; equity: number }> = [];
  const allTrades: TradeLogRow[] = [];

  for (let a = warm; a + trainDays + testDays <= dates.length; a += testDays) {
    const trainSlice = slice(data, dates[a - warm]!, dates[a + trainDays - 1]!);
    let best: { p: Partial<M3Config>; s: number } | null = null;
    for (const p of grid) {
      const r = await simulateVersion({ ...cfg, ...p }, trainSlice, { hooks: m3Hooks, fillGaps: fill, slippageBps });
      const s = score(r.metrics.totalReturnPct, r.metrics.maxDrawdownPct);
      if (!best || s > best.s) best = { p, s };
    }
    const tStart = a + trainDays;
    const testSlice = slice(data, dates[tStart - warm]!, dates[tStart + testDays - 1]!);
    const merged = { ...cfg, ...best!.p };
    const t = await simulateVersion(merged, testSlice, {
      hooks: m3Hooks,
      fillGaps: fill,
      slippageBps,
      initialBook: carryBook,
    });
    carryBook = t.book;
    allTrades.push(...t.trades);
    for (const row of t.equity) {
      equityPath.push({ date: row.date, equity: row.equity });
      globalPeak = Math.max(globalPeak, row.equity);
      globalMaxDd = Math.max(globalMaxDd, (globalPeak - row.equity) / globalPeak);
    }
    oos *= 1 + t.metrics.totalReturnPct / 100;
    bench *= 1 + t.metrics.spyReturnPct / 100;
    windows.push({
      trainStart: dates[a]!,
      testStart: dates[tStart]!,
      testEnd: dates[tStart + testDays - 1]!,
      chosen: best!.p,
      trainScore: best!.s,
      testReturnPct: t.metrics.totalReturnPct,
      testBenchmarkPct: t.metrics.spyReturnPct,
      testMaxDrawdownPct: t.metrics.maxDrawdownPct,
      testTrades: t.metrics.tradeCount,
    });
    if (persist && t.book.halted) {
      haltedOn = dates[tStart + testDays - 1]!;
      break;
    }
  }

  const sells = allTrades.filter((t) => t.side === 'sell' && t.pnl != null);
  const wins = sells.filter((t) => (t.pnl ?? 0) > 0).length;
  const oosReturnPct = (oos - 1) * 100;
  const oosBenchmarkPct = (bench - 1) * 100;
  return {
    windows,
    haltedOn,
    oosReturnPct,
    oosBenchmarkPct,
    oosExcessPct: oosReturnPct - oosBenchmarkPct,
    oosMaxDrawdownPct: globalMaxDd * 100,
    oosSharpe: sharpeFromEquity(equityPath),
    oosTradeCount: allTrades.length,
    oosWinRatePct: sells.length ? (wins / sells.length) * 100 : 0,
    oosCostsPctOfBudget: estimateCostsPct(allTrades, cfg.budgetUsd, cfg.feeBps ?? 0, slippageBps),
    oosPeriodStart: windows[0]?.testStart ?? '',
    oosPeriodEnd: windows[windows.length - 1]?.testEnd ?? '',
  };
}
