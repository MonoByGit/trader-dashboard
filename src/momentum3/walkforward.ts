import { dateOf } from '../momentum2/indicators';
import { simulateVersion, type SimData } from '../momentum2/simulate';
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
  /** Datum waarop de verliesgrens in een testvenster werd geraakt; daarna blijft de versie uit (zoals live). */
  haltedOn: string | null;
  /** Samengestelde rendementen over alle testvensters (out-of-sample). */
  oosReturnPct: number;
  oosBenchmarkPct: number;
  oosExcessPct: number;
}

function slice(data: SimData, fromDate: string, toDate: string): SimData {
  const cut = (bars: SimData['benchmark']) => bars.filter((b) => dateOf(b) >= fromDate && dateOf(b) <= toDate);
  return {
    benchmark: cut(data.benchmark),
    barsBySymbol: Object.fromEntries(Object.entries(data.barsBySymbol).map(([s, b]) => [s, cut(b)])),
  };
}

const score = (ret: number, dd: number) => ret - 0.5 * dd; // rendement, gestraft voor drawdown

/**
 * Walk-forward: kies per venster de beste parameters op de trainperiode en meet ze op de daaropvolgende
 * testperiode die het model nooit zag. Opwarmhistorie (smaDays) ligt vóór elk venster.
 */
export async function walkForward(input: {
  cfg: M3Config;
  data: SimData;
  grid: Array<Partial<M3Config>>;
  trainDays: number;
  testDays: number;
  /** Na een gehalte venster geen verdere vensters meer (live-gedrag). Standaard aan. */
  haltPersists?: boolean;
}): Promise<WalkForwardResult> {
  const { cfg, data, grid, trainDays, testDays } = input;
  const persist = input.haltPersists ?? true;
  const fill = cfg.kind === 'crypto';
  let haltedOn: string | null = null;
  const dates = data.benchmark.map(dateOf);
  const warm = cfg.smaDays;
  const windows: WalkForwardWindow[] = [];
  let oos = 1;
  let bench = 1;

  for (let a = warm; a + trainDays + testDays <= dates.length; a += testDays) {
    const trainSlice = slice(data, dates[a - warm]!, dates[a + trainDays - 1]!);
    let best: { p: Partial<M3Config>; s: number } | null = null;
    for (const p of grid) {
      const r = await simulateVersion({ ...cfg, ...p }, trainSlice, { hooks: m3Hooks, fillGaps: fill });
      const s = score(r.metrics.totalReturnPct, r.metrics.maxDrawdownPct);
      if (!best || s > best.s) best = { p, s };
    }
    const tStart = a + trainDays;
    const testSlice = slice(data, dates[tStart - warm]!, dates[tStart + testDays - 1]!);
    const t = await simulateVersion({ ...cfg, ...best!.p }, testSlice, { hooks: m3Hooks, fillGaps: fill });
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
      break; // verliesgrens geraakt: de versie blijft uit tot iemand hem handmatig terugzet
    }
  }
  const oosReturnPct = (oos - 1) * 100;
  const oosBenchmarkPct = (bench - 1) * 100;
  return { windows, haltedOn, oosReturnPct, oosBenchmarkPct, oosExcessPct: oosReturnPct - oosBenchmarkPct };
}
