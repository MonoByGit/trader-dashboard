import {
  DEFAULT_DAILY_BAR_LOOKBACK_DAYS,
  fetchCryptoBars,
  fetchStockDailyBars,
} from './alpaca-bars';
import {
  assertAlpacaPaperTrading,
  alpacaTradingBaseUrl,
} from '../../src/alpaca/paper-host';
import { logAlpacaModeAtStartup } from './alpaca-startup';
import { alpacaPositionCloseUrl } from '../../src/alpaca/symbol-path';

logAlpacaModeAtStartup();

const BASE = alpacaTradingBaseUrl();
const DATA = 'https://data.alpaca.markets';

function headers() {
  return {
    'APCA-API-KEY-ID': process.env.ALPACA_API_KEY!,
    'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY!,
    'Content-Type': 'application/json',
  };
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Alpaca ${url}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function post<T>(url: string, body: unknown, options?: { trading?: boolean }): Promise<T> {
  if (options?.trading) assertAlpacaPaperTrading(BASE);
  const res = await fetch(url, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Alpaca POST ${url}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function del<T>(url: string, options?: { trading?: boolean }): Promise<T> {
  if (options?.trading) assertAlpacaPaperTrading(BASE);
  const res = await fetch(url, { method: 'DELETE', headers: headers() });
  if (!res.ok) throw new Error(`Alpaca DELETE ${url}: ${res.status} ${await res.text()}`);
  return res.json();
}

export const alpaca = {
  account: () => get<AlpacaAccount>(`${BASE}/v2/account`),
  positions: () => get<AlpacaPosition[]>(`${BASE}/v2/positions`),
  closePosition: (symbol: string) =>
    del<unknown>(alpacaPositionCloseUrl(BASE, symbol), { trading: true }),
  cancelAllOrders: () => del<{ id: number }[]>(`${BASE}/v2/orders`, { trading: true }),
  orders: (limit = 50) => get<AlpacaOrder[]>(`${BASE}/v2/orders?status=all&limit=${limit}&direction=desc`),
  openOrders: (limit = 100) =>
    get<AlpacaOrder[]>(`${BASE}/v2/orders?status=open&limit=${limit}&direction=desc`),
  placeOrder: (o: AlpacaOrderRequest) =>
    post<AlpacaOrder>(`${BASE}/v2/orders`, o, { trading: true }),
  clock: () => get<AlpacaClock>(`${BASE}/v2/clock`),
  bars: async (symbols: string[], timeframe = '1Day', limit = 30) => {
    const bars = await fetchStockDailyBars({
      symbols,
      timeframe,
      limit,
      lookbackCalendarDays: DEFAULT_DAILY_BAR_LOOKBACK_DAYS,
      adjustment: 'split',
    });
    return { bars };
  },
  latestQuotes: (symbols: string[]) =>
    get<{ quotes: Record<string, AlpacaQuote> }>(
      `${DATA}/v2/stocks/quotes/latest?symbols=${symbols.join(',')}&feed=${process.env.ALPACA_DATA_FEED ?? 'iex'}`,
    ),
  calendar: (start: string, end: string) =>
    get<AlpacaCalendarDay[]>(`${BASE}/v2/calendar?start=${start}&end=${end}`),
  cryptoBars: async (symbols: string[], timeframe = '1Day', limit = 100) => {
    const bars = await fetchCryptoBars({
      symbols,
      timeframe,
      limit,
      lookbackCalendarDays: DEFAULT_DAILY_BAR_LOOKBACK_DAYS,
    });
    return { bars };
  },
  cryptoBarsRange: async (symbols: string[], start: string, end: string, timeframe = '1Day') => {
    const bars = await fetchCryptoBars({ symbols, start, end, timeframe });
    return { bars };
  },
  portfolioHistory: (period = '1A', timeframe = '1D') =>
    get<AlpacaPortfolioHistory>(
      `${BASE}/v2/account/portfolio/history?period=${period}&timeframe=${timeframe}&extended_hours=false`,
    ),
};

export interface AlpacaAccount {
  id: string;
  equity: string;
  cash: string;
  buying_power: string;
  portfolio_value: string;
  last_equity: string;
  daytrade_count: number;
  daytrading_buying_power: string;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
  account_blocked: boolean;
  status: string;
}

export interface AlpacaPosition {
  symbol: string;
  qty: string;
  avg_entry_price: string;
  current_price: string;
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  side: string;
  asset_class: string;
  change_today: string;
}

export interface AlpacaOrder {
  id: string;
  symbol: string;
  side: string;
  qty: string;
  filled_qty: string;
  type: string;
  status: string;
  submitted_at: string;
  filled_at: string | null;
  filled_avg_price: string | null;
  limit_price: string | null;
  stop_price: string | null;
}

export interface AlpacaOrderRequest {
  symbol: string;
  qty?: number;
  notional?: number;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit' | 'trailing_stop';
  time_in_force: 'day' | 'gtc' | 'ioc' | 'fok';
  limit_price?: number;
  stop_price?: number;
  trail_percent?: number;
  order_class?: 'simple' | 'bracket' | 'oco' | 'oto';
  stop_loss?: { stop_price: number };
  take_profit?: { limit_price: number };
}

export interface AlpacaClock {
  timestamp: string;
  is_open: boolean;
  next_open: string;
  next_close: string;
}

export interface AlpacaBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  vw: number;
}

export interface AlpacaQuote {
  ap: number;
  bp: number;
  as: number;
  bs: number;
  t: string;
}

export interface AlpacaCalendarDay {
  date: string;
  open: string;
  close: string;
}

export interface AlpacaPortfolioHistory {
  timestamp: number[];
  equity: number[];
  profit_loss: number[];
  profit_loss_pct: number[];
  base_value: number;
  timeframe: string;
}
