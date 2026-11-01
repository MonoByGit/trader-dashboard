import type { BacktestEquityPoint, BacktestMetrics, BacktestTrade } from './types';

const TRADING_DAYS = 252;

export function maxDrawdownPct(equities: number[]): number {
  if (equities.length < 2) return 0;
  let peak = equities[0]!;
  let maxDd = 0;
  for (const e of equities) {
    if (e > peak) peak = e;
    const dd = peak > 0 ? ((peak - e) / peak) * 100 : 0;
    if (dd > maxDd) maxDd = dd;
  }
  return +maxDd.toFixed(4);
}

export function totalReturnPct(start: number, end: number): number {
  if (start <= 0) return 0;
  return +(((end - start) / start) * 100).toFixed(4);
}

export function annualizedReturnPct(totalReturnPct: number, numDays: number): number {
  if (numDays <= 0) return 0;
  const growth = 1 + totalReturnPct / 100;
  const years = numDays / TRADING_DAYS;
  if (years <= 0 || growth <= 0) return 0;
  return +((Math.pow(growth, 1 / years) - 1) * 100).toFixed(4);
}

export function sharpeRatio(dailyReturns: number[]): number | null {
  if (dailyReturns.length < 2) return null;
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance =
    dailyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / (dailyReturns.length - 1);
  const stdev = Math.sqrt(variance);
  if (stdev === 0) return null;
  return +((mean / stdev) * Math.sqrt(TRADING_DAYS)).toFixed(4);
}

export function dailyReturnsFromEquity(curve: { equity: number }[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1]!.equity;
    const curr = curve[i]!.equity;
    if (prev > 0) out.push((curr - prev) / prev);
  }
  return out;
}

export function winRatePct(trades: BacktestTrade[]): number | null {
  const closed = trades.filter((t) => t.side === 'sell' && t.pnl != null);
  if (!closed.length) return null;
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  return +((wins / closed.length) * 100).toFixed(2);
}

export function computeMetrics(
  curve: BacktestEquityPoint[],
  trades: BacktestTrade[],
  benchmarkSymbol = 'SPY',
): {
  strategy: Omit<
    BacktestMetrics,
    'spyTotalReturnPct' | 'spyAnnualizedReturnPct' | 'spyMaxDrawdownPct' | 'spySharpeRatio' | 'benchmarkSymbol'
  >;
  spy: Pick<
    BacktestMetrics,
    'spyTotalReturnPct' | 'spyAnnualizedReturnPct' | 'spyMaxDrawdownPct' | 'spySharpeRatio' | 'benchmarkSymbol'
  >;
} {
  if (!curve.length) {
    const empty = {
      totalReturnPct: 0,
      annualizedReturnPct: 0,
      maxDrawdownPct: 0,
      sharpeRatio: null,
      winRatePct: null,
      tradeCount: trades.length,
      avgExposurePct: 0,
    };
    return {
      strategy: empty,
      spy: {
        spyTotalReturnPct: 0,
        spyAnnualizedReturnPct: 0,
        spyMaxDrawdownPct: 0,
        spySharpeRatio: null,
        benchmarkSymbol,
      },
    };
  }

  const start = curve[0]!.equity;
  const end = curve[curve.length - 1]!.equity;
  const numDays = curve.length;
  const stratEquities = curve.map((p) => p.equity);
  const spyEquities = curve.map((p) => p.spyEquity);

  const exposureSum = curve.reduce((s, p) => s + (p.equity > 0 ? (p.exposure / p.equity) * 100 : 0), 0);
  const avgExposurePct = numDays > 0 ? +(exposureSum / numDays).toFixed(2) : 0;

  const stratTotal = totalReturnPct(start, end);
  const spyStart = curve[0]!.spyEquity;
  const spyEnd = curve[curve.length - 1]!.spyEquity;
  const spyTotal = totalReturnPct(spyStart, spyEnd);

  return {
    strategy: {
      totalReturnPct: stratTotal,
      annualizedReturnPct: annualizedReturnPct(stratTotal, numDays),
      maxDrawdownPct: maxDrawdownPct(stratEquities),
      sharpeRatio: sharpeRatio(dailyReturnsFromEquity(curve.map((c) => ({ equity: c.equity })))),
      winRatePct: winRatePct(trades),
      tradeCount: trades.filter((t) => t.side === 'buy').length,
      avgExposurePct,
    },
    spy: {
      spyTotalReturnPct: spyTotal,
      spyAnnualizedReturnPct: annualizedReturnPct(spyTotal, numDays),
      spyMaxDrawdownPct: maxDrawdownPct(spyEquities),
      spySharpeRatio: sharpeRatio(dailyReturnsFromEquity(curve.map((c) => ({ equity: c.spyEquity })))),
      benchmarkSymbol,
    },
  };
}
