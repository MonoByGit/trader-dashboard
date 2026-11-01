import { dateOf } from '../momentum2/indicators';
import { simulateVersion, type SimData } from '../momentum2/simulate';
import type { EquityLogRow, TradeLogRow } from '../momentum2/types';
import { summarizeBacktest, type BacktestSummary } from './backtest-metrics';
import type { M4Config } from './config';
import type { CopySignal } from './holdings';
import { makeM4Hooks } from './plan';

export interface WalkForwardWindow {
  trainStart: string;
  testStart: string;
  testEnd: string;
  chosen: Partial<M4Config>;
  trainScore: number;
  test: BacktestSummary;
}

export interface WalkForwardResult {
  windows: WalkForwardWindow[];
  oos: BacktestSummary;
}

function slice(data: SimData, fromDate: string, toDate: string): SimData {
  const cut = (bars: SimData['benchmark']) => bars.filter((b) => dateOf(b) >= fromDate && dateOf(b) <= toDate);
  return {
    benchmark: cut(data.benchmark),
    barsBySymbol: Object.fromEntries(Object.entries(data.barsBySymbol).map(([s, b]) => [s, cut(b)])),
  };
}

const score = (ret: number, dd: number) => ret - 0.5 * dd;

/**
 * Walk-forward out-of-sample: kies parameters op train, meet op test. Geen peeking in test.
 */
export async function walkForwardM4(input: {
  cfg: M4Config;
  data: SimData;
  signalsByDate: Record<string, CopySignal[]>;
  grid: Array<Partial<M4Config>>;
  trainDays: number;
  testDays: number;
  slippageBps?: number;
}): Promise<WalkForwardResult> {
  const { cfg, data, signalsByDate, grid, trainDays, testDays } = input;
  const dates = data.benchmark.map(dateOf);
  const warm = cfg.smaDays;
  const windows: WalkForwardWindow[] = [];
  const oosEquity: EquityLogRow[] = [];
  const oosTrades: TradeLogRow[] = [];
  const budget = cfg.budgetUsd;
  let scale = 1;
  let spyScale = 1;

  for (let a = warm; a + trainDays + testDays <= dates.length; a += testDays) {
    const trainSlice = slice(data, dates[a - warm]!, dates[a + trainDays - 1]!);
    let best: { p: Partial<M4Config>; s: number } | null = null;
    for (const p of grid) {
      const hooks = makeM4Hooks((d) => signalsByDate[d] ?? []);
      const r = await simulateVersion({ ...cfg, ...p }, trainSlice, { hooks, slippageBps: input.slippageBps });
      const s = score(r.metrics.totalReturnPct, r.metrics.maxDrawdownPct);
      if (!best || s > best.s) best = { p, s };
    }
    const tStart = a + trainDays;
    const testSlice = slice(data, dates[tStart - warm]!, dates[tStart + testDays - 1]!);
    const hooks = makeM4Hooks((d) => signalsByDate[d] ?? []);
    const t = await simulateVersion({ ...cfg, ...best!.p }, testSlice, { hooks, slippageBps: input.slippageBps });
    const test = summarizeBacktest({
      equity: t.equity,
      trades: t.trades,
      budgetUsd: cfg.budgetUsd,
      slippageBps: input.slippageBps,
      feeBps: cfg.feeBps,
    });
    const baseEq = t.equity[0]?.equity ?? budget;
    const baseSpy = t.equity[0]?.spyEquity ?? budget;
    for (const row of t.equity) {
      oosEquity.push({
        ...row,
        equity: (row.equity / baseEq) * budget * scale,
        spyEquity: (row.spyEquity / baseSpy) * budget * spyScale,
        cash: (row.cash / baseEq) * budget * scale,
        exposure: (row.exposure / baseEq) * budget * scale,
        excessVsSpyPct: row.excessVsSpyPct,
      });
    }
    oosTrades.push(...t.trades);
    const lastRow = t.equity.at(-1);
    if (lastRow) {
      scale *= lastRow.equity / baseEq;
      spyScale *= lastRow.spyEquity / baseSpy;
    }
    windows.push({
      trainStart: dates[a]!,
      testStart: dates[tStart]!,
      testEnd: dates[tStart + testDays - 1]!,
      chosen: best!.p,
      trainScore: best!.s,
      test,
    });
  }

  const oos = summarizeBacktest({
    equity: oosEquity.length ? oosEquity : [{ date: '', equity: budget, spyEquity: budget, cash: budget, exposure: 0, excessVsSpyPct: 0 }],
    trades: oosTrades,
    budgetUsd: cfg.budgetUsd,
    slippageBps: input.slippageBps,
    feeBps: cfg.feeBps,
  });
  return { windows, oos };
}
