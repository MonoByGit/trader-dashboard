const BASE = process.env.ALPACA_BASE_URL ?? 'https://paper-api.alpaca.markets';
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

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Alpaca POST ${url}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function del<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: 'DELETE', headers: headers() });
  if (!res.ok) throw new Error(`Alpaca DELETE ${url}: ${res.status} ${await res.text()}`);
  return res.json();
}

export const alpaca = {
  account: () => get<AlpacaAccount>(`${BASE}/v2/account`),
  positions: () => get<AlpacaPosition[]>(`${BASE}/v2/positions`),
  closePosition: (symbol: string) => del<unknown>(`${BASE}/v2/positions/${symbol}`),
  orders: (limit = 50) => get<AlpacaOrder[]>(`${BASE}/v2/orders?status=all&limit=${limit}&direction=desc`),
  placeOrder: (o: AlpacaOrderRequest) => post<AlpacaOrder>(`${BASE}/v2/orders`, o),
  clock: () => get<AlpacaClock>(`${BASE}/v2/clock`),
  bars: (symbols: string[], timeframe = '1Day', limit = 30) =>
    get<{ bars: Record<string, AlpacaBar[]> }>(
      `${DATA}/v2/stocks/bars?symbols=${symbols.join(',')}&timeframe=${timeframe}&limit=${limit}&feed=iex`
    ),
  latestQuotes: (symbols: string[]) =>
    get<{ quotes: Record<string, AlpacaQuote> }>(
      `${DATA}/v2/stocks/quotes/latest?symbols=${symbols.join(',')}&feed=iex`
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
