export type GuardModule =
  | 'validate-trade'
  | 'portfolio-limits'
  | 'circuit-breakers'
  | 'kill-switch'
  | 'emergency-stop'
  | 'eod-clock';

export interface CircuitBreakerInput {
  equity: number;
  dayStartEquity: number;
  sessionPeakEquity: number;
  consecutiveLosses: number;
  ordersLast10Min: number;
}

export interface CircuitBreakerResult {
  tripped: boolean;
  reason?: string;
  trigger?: 'daily_drawdown' | 'peak_drawdown' | 'consecutive_losses' | 'rapid_orders';
  dailyDrawdownPct: number;
  peakDrawdownPct: number;
}

export interface PortfolioLimitsInput {
  equity: number;
  cash: number;
  openPositionCount: number;
  dailyTrades: number;
  proposedOrderValueUsd: number;
  currentSymbolExposureUsd?: number;
  totalExposureUsd: number;
}

export interface PortfolioLimitsResult {
  allowed: boolean;
  failReasons: string[];
  warnings: string[];
}

export interface AlpacaClockLike {
  timestamp: string;
  is_open: boolean;
  next_open: string;
  next_close: string;
}

export type EodClosePlan =
  | { action: 'flatten'; reason: string }
  | { action: 'keep_brackets'; reason: string }
  | { action: 'skip_no_positions'; reason: string };

export interface RoutineGateInput {
  routine: string;
  emergencyStop: boolean;
  tradingEnabled: boolean;
  circuitBreakerTripped: boolean;
}

export interface RoutineGateResult {
  allowed: boolean;
  reason?: string;
}
