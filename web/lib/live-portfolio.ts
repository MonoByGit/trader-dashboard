import type { Portfolio, Position } from '@/lib/mock';

export type GuardsState = {
  tradingEnabled: boolean;
  circuitBreakerTripped: boolean;
  circuitBreakerReason?: string;
  dailyDrawdownPct: number;
  peakDrawdownPct: number;
  dailyDrawdownLimit: number;
  peakDrawdownLimit: number;
  consecLosses: number;
  consecLossesLimit: number;
  tradesLast10Min: number;
  tradesLast10MinLimit: number;
  openPositions: number;
  maxOpenPositions: number;
  dailyTrades: number;
  maxDailyTrades: number;
  cashReservePct: number;
  cashReserveMin: number;
  maxOrderSize: number;
  minOrderSize: number;
};

export const DEFAULT_GUARDS: GuardsState = {
  tradingEnabled: true,
  circuitBreakerTripped: false,
  dailyDrawdownPct: 0,
  peakDrawdownPct: 0,
  dailyDrawdownLimit: 3,
  peakDrawdownLimit: 10,
  consecLosses: 0,
  consecLossesLimit: 3,
  tradesLast10Min: 0,
  tradesLast10MinLimit: 5,
  openPositions: 0,
  maxOpenPositions: 3,
  dailyTrades: 0,
  maxDailyTrades: 10,
  cashReservePct: 10,
  cashReserveMin: 10,
  maxOrderSize: 25000,
  minOrderSize: 100,
};

type AccountSlice = {
  equity: number;
  cash: number;
  dayPnl: number;
  dayPnlPct: number;
} | null;

type AlpacaPos = {
  symbol: string;
  qty: number;
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  costBasis: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
};

export function mapAlpacaPositions(rows: AlpacaPos[]): Position[] {
  return rows.map((p) => ({
    symbol: p.symbol,
    name: p.symbol,
    sector: '—',
    qty: p.qty,
    avgEntryPrice: p.avgEntryPrice,
    currentPrice: p.currentPrice,
    highWatermark: p.currentPrice,
    entryAt: '',
    stopLoss: 0,
    trailingStop: 0,
    takeProfit: 0,
    sma20: 0,
    marketValue: p.marketValue,
    costBasis: p.costBasis,
    unrealizedPnl: p.unrealizedPnl,
    unrealizedPnlPct: p.unrealizedPnlPct,
    sparkline: [],
  }));
}

export function buildLivePortfolio(
  account: AccountSlice,
  positions: AlpacaPos[],
  tradingEnabled: boolean,
): Portfolio {
  const mapped = mapAlpacaPositions(positions);
  const equity = account?.equity ?? 0;
  const cash = account?.cash ?? 0;
  const dayPnl = account?.dayPnl ?? 0;
  const dayPnlPct = account ? account.dayPnlPct * 100 : 0;
  const dayStart = equity - dayPnl;
  return {
    totalEquity: equity,
    cashBalance: cash,
    dayStartEquity: dayStart,
    dailyPnl: dayPnl,
    dailyPnlPct: dayPnlPct,
    allTimePnl: 0,
    allTimePnlPct: 0,
    tradingEnabled,
    circuitBreakerTripped: false,
    positions: mapped,
  };
}

/** Intraday spark/equity: start of day → now (minimaal 2 punten). */
export function intradayFromAccount(account: AccountSlice): number[] {
  if (!account || account.equity <= 0) return [];
  const start = account.equity - account.dayPnl;
  if (Math.abs(start - account.equity) < 0.01) return [account.equity, account.equity];
  return [start, account.equity];
}
