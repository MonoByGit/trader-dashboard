import { dateOf } from './indicators';
import type { StrategyHooks } from './hooks';
import { simulateVersion, type SimData, type SimOptions } from './simulate';
import type { VersionBook, VersionConfig } from './types';
import {
  totalReturnPctFromEquityPath,
  totalReturnPctFromLevelPath,
  type WalkForwardResult,
  type WalkForwardWindow,
} from '../momentum3/walkforward';

function slice(data: SimData, fromDate: string, toDate: string): SimData {
  const cut = (bars: SimData['benchmark']) => bars.filter((b) => dateOf(b) >= fromDate && dateOf(b) <= toDate);
  return {
    benchmark: cut(data.benchmark),
    barsBySymbol: Object.fromEntries(Object.entries(data.barsBySymbol).map(([s, b]) => [s, cut(b)])),
  };
}

function sharpeFromEquity(daily: Array<{ date: string; equity: number }>, periodsPerYear: number): number {
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
  return sd > 1e-12 ? (mean / sd) * Math.sqrt(periodsPerYear) : 0;
}

function maxDrawdownFromSeries(values: number[]): number {
  if (values.length === 0) return 0;
  let peak = values[0]!;
  let maxDd = 0;
  for (const v of values) {
    peak = Math.max(peak, v);
    maxDd = Math.max(maxDd, (peak - v) / peak);
  }
  return maxDd * 100;
}

/** Walk-forward zonder parameterraster: OOS-vensters met doorlopend boek (initialBook carry). */
export async function walkForwardCarry<C extends VersionConfig>(input: {
  cfg: C;
  data: SimData;
  hooks: StrategyHooks<C>;
  testDays: number;
  slippageBps?: number;
  fillGaps?: boolean;
  haltPersists?: boolean;
  periodsPerYear?: number;
}): Promise<WalkForwardResult> {
  const { cfg, data, hooks, testDays, slippageBps = 2, fillGaps = false } = input;
  const persist = input.haltPersists ?? true;
  const dates = data.benchmark.map(dateOf);
  const warm = cfg.smaDays;
  const windows: WalkForwardWindow[] = [];
  let carryBook: VersionBook | undefined;
  let haltedOn: string | null = null;
  let globalPeak = cfg.budgetUsd;
  let globalMaxDd = 0;
  const equityPath: Array<{ date: string; equity: number }> = [];
  const benchmarkPath: number[] = [];
  let benchOosStart: number | null = null;
  const benchByDate = new Map(data.benchmark.map((b) => [dateOf(b), b.c]));
  const allTrades: typeof import('./types').TradeLogRow[] = [];
  const sharpeYear = input.periodsPerYear ?? (fillGaps ? 365 : 252);
  const simOpts: SimOptions = { hooks, fillGaps, slippageBps };

  for (let tStart = warm; tStart + testDays <= dates.length; tStart += testDays) {
    const testSlice = slice(data, dates[tStart - warm]!, dates[tStart + testDays - 1]!);
    const t = await simulateVersion(cfg, testSlice, { ...simOpts, initialBook: carryBook });
    carryBook = t.book;
    allTrades.push(...t.trades);
    for (const row of t.equity) {
      equityPath.push({ date: row.date, equity: row.equity });
      globalPeak = Math.max(globalPeak, row.equity);
      globalMaxDd = Math.max(globalMaxDd, (globalPeak - row.equity) / globalPeak);
      const px = benchByDate.get(row.date);
      if (px != null) {
        if (benchOosStart === null) benchOosStart = px;
        benchmarkPath.push(px / benchOosStart);
      }
    }
    windows.push({
      trainStart: dates[tStart]!,
      testStart: dates[tStart]!,
      testEnd: dates[tStart + testDays - 1]!,
      chosen: {},
      trainScore: 0,
      testReturnPct: t.metrics.totalReturnPct,
      testBenchmarkPct: t.metrics.spyReturnPct,
      testMaxDrawdownPct: t.metrics.maxDrawdownPct,
      testTrades: t.metrics.tradeCount,
    });
    if (persist && t.book.halted) {
      haltedOn = t.metrics.haltedDate;
      break;
    }
  }

  const sells = allTrades.filter((t) => t.side === 'sell' && t.pnl != null);
  const wins = sells.filter((t) => (t.pnl ?? 0) > 0).length;
  const oosReturnPct = totalReturnPctFromEquityPath(equityPath);
  const oosBenchmarkPct = totalReturnPctFromLevelPath(benchmarkPath);
  let costs = 0;
  const bps = ((cfg.feeBps ?? 0) + slippageBps) / 10000;
  for (const t of allTrades) costs += t.qty * t.price * bps;

  return {
    windows,
    haltedOn,
    oosReturnPct,
    oosBenchmarkPct,
    oosExcessPct: oosReturnPct - oosBenchmarkPct,
    oosMaxDrawdownPct: globalMaxDd * 100,
    oosBenchmarkMaxDrawdownPct: maxDrawdownFromSeries(benchmarkPath),
    oosSharpe: sharpeFromEquity(equityPath, sharpeYear),
    oosTradeCount: allTrades.length,
    oosWinRatePct: sells.length ? (wins / sells.length) * 100 : 0,
    oosCostsPctOfBudget: cfg.budgetUsd > 0 ? (costs / cfg.budgetUsd) * 100 : 0,
    oosPeriodStart: windows[0]?.testStart ?? '',
    oosPeriodEnd: windows[windows.length - 1]?.testEnd ?? '',
  };
}
