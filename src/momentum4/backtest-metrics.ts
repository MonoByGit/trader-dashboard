import type { EquityLogRow, TradeLogRow } from '../momentum2/types';

export interface BacktestSummary {
  returnPct: number;
  spyReturnPct: number;
  excessPct: number;
  maxDrawdownPct: number;
  sharpe: number;
  trades: number;
  winRatePct: number;
  costUsd: number;
  periodStart: string;
  periodEnd: string;
}

/** Sharpe op dagelijkse versie-rendementen (annualized, rf=0). */
export function sharpeFromEquity(rows: EquityLogRow[]): number {
  if (rows.length < 3) return 0;
  const rets: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1]!.equity;
    const b = rows[i]!.equity;
    if (a > 0) rets.push(b / a - 1);
  }
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const var_ = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / Math.max(1, rets.length - 1);
  const sd = Math.sqrt(var_);
  if (sd === 0) return 0;
  return (mean / sd) * Math.sqrt(252);
}

/** Winrate: verkopen met positieve PnL t.o.v. entry (vereenvoudigd). */
export function winRatePct(trades: TradeLogRow[]): number {
  const sells = trades.filter((t) => t.side === 'sell');
  if (!sells.length) return 0;
  const wins = sells.filter((t) => (t.pnl ?? 0) > 0).length;
  return (wins / sells.length) * 100;
}

export function summarizeBacktest(input: {
  equity: EquityLogRow[];
  trades: TradeLogRow[];
  budgetUsd: number;
  slippageBps?: number;
  feeBps?: number;
}): BacktestSummary {
  const { equity, trades, budgetUsd } = input;
  const first = equity[0];
  const last = equity[equity.length - 1];
  let peak = budgetUsd;
  let maxDd = 0;
  for (const row of equity) {
    peak = Math.max(peak, row.equity);
    maxDd = Math.max(maxDd, (peak - row.equity) / peak);
  }
  const slip = (input.slippageBps ?? 2) / 10000;
  const fee = (input.feeBps ?? 1) / 10000;
  const costUsd = trades.reduce((s, t) => s + t.qty * t.price * (slip + fee), 0);
  return {
    returnPct: last ? (last.equity / budgetUsd - 1) * 100 : 0,
    spyReturnPct: last ? (last.spyEquity / budgetUsd - 1) * 100 : 0,
    excessPct: last ? ((last.equity - last.spyEquity) / budgetUsd) * 100 : 0,
    maxDrawdownPct: maxDd * 100,
    sharpe: sharpeFromEquity(equity),
    trades: trades.length,
    winRatePct: winRatePct(trades),
    costUsd,
    periodStart: first?.date ?? '',
    periodEnd: last?.date ?? '',
  };
}
