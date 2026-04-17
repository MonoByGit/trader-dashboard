export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop' | 'stop_limit';
export type TimeInForce = 'day' | 'gtc' | 'ioc' | 'fok';
export type RoutineType = 'premarket' | 'market-open' | 'midday' | 'close' | 'weekly';
export type TradeStatus = 'proposed' | 'validated' | 'rejected' | 'executed' | 'failed';

export interface TradeProposal {
  id: string;                    // uuid
  symbol: string;                // e.g. "SPY"
  side: OrderSide;
  quantity: number;
  orderType: OrderType;
  limitPrice?: number;
  stopPrice?: number;
  timeInForce: TimeInForce;
  rationale: string;             // LLM explanation
  strategyTag: string;           // e.g. "momentum-breakout"
  proposedAt: string;            // ISO timestamp
}

export interface ValidationResult {
  passed: boolean;
  failReasons: string[];
  warnings: string[];
}

export interface ValidatedTrade {
  proposal: TradeProposal;
  strategyValidation: ValidationResult;
  portfolioValidation: ValidationResult;
  circuitBreakerValidation: ValidationResult;
  status: TradeStatus;
  validatedAt: string;
}

export interface Position {
  symbol: string;
  quantity: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  side: 'long' | 'short';
}

export interface PortfolioState {
  asOf: string;                  // ISO timestamp
  cashBalance: number;
  totalEquity: number;
  dayStartEquity: number;
  dailyPnl: number;
  dailyPnlPct: number;
  positions: Position[];
  openOrderIds: string[];
  tradingEnabled: boolean;
  circuitBreakerTripped: boolean;
  circuitBreakerReason?: string;
}

export interface RoutineResult {
  routineType: RoutineType;
  executedAt: string;
  success: boolean;
  summary: string;
  tradesProposed: TradeProposal[];
  tradesExecuted: ValidatedTrade[];
  tradesRejected: ValidatedTrade[];
  errors: string[];
  openBrainThoughtId?: string;
}
