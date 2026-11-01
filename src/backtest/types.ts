/** Daily OHLCV bar (Alpaca-compatible). */
export interface DailyBar {
  t: string; // ISO date or timestamp
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type FillMode = 'next_open' | 'same_close';

export type BarMode = 'daily' | 'hourly';

export interface BacktestParams {
  initialCapital: number;
  fillMode: FillMode;
  /** Daily (default) or hourly bars for intraday bracket simulation. */
  barMode?: BarMode;
  /** Slippage in basis points applied against the trader (buy worse, sell worse). */
  slippageBps: number;
  /** Commission per share (USD). */
  commissionPerShare: number;
  /** Minimum commission per order (USD). */
  minCommissionUsd: number;
}

export interface StrategyRulesLike {
  max_positions: number;
  hold_overnight: boolean;
  hard_stop_pct: number;
  take_profit_pct: number;
  rsi_min: number;
  rsi_max: number;
  volume_ratio_min: number;
  /** @deprecated UI legacy; vol gate uses vol_stress_ratio_max */
  vix_threshold: number;
  /** VIXY close / 20d SMA; fail when above this (default 1.15). */
  vol_stress_ratio_max?: number;
}

export interface BacktestEngineInput {
  tradingDates: string[]; // YYYY-MM-DD sorted
  barsBySymbol: Record<string, DailyBar[]>;
  /** When barMode is hourly: raw hourly bars per symbol for bracket walks. */
  hourlyBarsBySymbol?: Record<string, DailyBar[]>;
  /** Benchmark buy-and-hold bars (SPY for ETF runs, BTC for crypto). */
  spyBars: DailyBar[];
  vixBars?: DailyBar[];
  symbols: string[];
  rules: StrategyRulesLike;
  params: BacktestParams;
  guardEnv?: Record<string, string>;
  assetClass?: 'etf' | 'crypto';
  /** Label for benchmark metrics/UI (default SPY). */
  benchmarkSymbol?: string;
}

export interface BacktestTrade {
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  date: string;
  reason: string;
  pnl?: number;
}

export interface BacktestEquityPoint {
  date: string;
  equity: number;
  cash: number;
  exposure: number;
  spyEquity: number;
}

export interface BacktestMetrics {
  totalReturnPct: number;
  annualizedReturnPct: number;
  maxDrawdownPct: number;
  sharpeRatio: number | null;
  winRatePct: number | null;
  tradeCount: number;
  avgExposurePct: number;
  spyTotalReturnPct: number;
  spyAnnualizedReturnPct: number;
  spyMaxDrawdownPct: number;
  spySharpeRatio: number | null;
  /** Buy-and-hold benchmark ticker shown in summaries (SPY or BTC). */
  benchmarkSymbol: string;
}

export interface BacktestEngineResult {
  trades: BacktestTrade[];
  equityCurve: BacktestEquityPoint[];
  metrics: BacktestMetrics;
  guardEvents: string[];
}
