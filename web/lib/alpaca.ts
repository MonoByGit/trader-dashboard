import {
  DEFAULT_DAILY_BAR_LOOKBACK_DAYS,
  fetchCryptoBars,
  fetchStockDailyBars,
} from './alpaca-bars';
import {
  assertAlpacaPaperTrading,
  alpacaTradingBaseUrl,
} from '../../src/alpaca/paper-host';
import {
  ALPACA_FETCH_TIMEOUT_MS,
  isAbortTimeoutError,
  parseAlpacaHttpStatus,
  shouldRecoverOrderPostError,
} from '../../src/alpaca/order-post-recovery';
import { logAlpacaModeAtStartup } from './alpaca-startup';
import { alpacaPositionCloseUrl } from '../../src/alpaca/symbol-path';
import { AlpacaHttpError } from '../../src/alpaca/alpaca-http-error';
import { alpacaHttpStatusFromError } from '../../src/alpaca/parse-http-error';
import { placeOrderWithReconcile } from '../../src/alpaca/order-post-reconcile';

logAlpacaModeAtStartup();

const BASE = alpacaTradingBaseUrl();
const DATA = 'https://data.alpaca.markets';
const FETCH_TIMEOUT_MS = 15_000;

function fetchInit(init?: RequestInit): RequestInit {
  return {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
  };
}

function headers() {
  return {
    'APCA-API-KEY-ID': process.env.ALPACA_API_KEY!,
    'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY!,
    'Content-Type': 'application/json',
  };
}

<<<<<<< HEAD
async function parseJsonBody<T>(res: Response): Promise<T> {
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, fetchInit({ headers: headers(), cache: 'no-store' }));
  if (!res.ok) throw new AlpacaHttpError('GET', url, res.status, await res.text());
  return parseJsonBody<T>(res);
}

async function post<T>(url: string, body: unknown, options?: { trading?: boolean }): Promise<T> {
  if (options?.trading) assertAlpacaPaperTrading(BASE);
  const res = await fetch(
    url,
    fetchInit({ method: 'POST', headers: headers(), body: JSON.stringify(body) }),
  );
  if (!res.ok) throw new AlpacaHttpError('POST', url, res.status, await res.text());
  return parseJsonBody<T>(res);
}

async function del<T>(url: string, options?: { trading?: boolean }): Promise<T> {
  if (options?.trading) assertAlpacaPaperTrading(BASE);
  const res = await fetch(url, fetchInit({ method: 'DELETE', headers: headers() }));
  if (!res.ok) throw new AlpacaHttpError('DELETE', url, res.status, await res.text());
  return parseJsonBody<T>(res);
}

async function getOrderByClientOrderId(clientOrderId: string): Promise<AlpacaOrder | null> {
  try {
    return await get<AlpacaOrder>(
      `${BASE}/v2/orders:by_client_order_id?client_order_id=${encodeURIComponent(clientOrderId)}`,
    );
  } catch (e) {
    if (alpacaHttpStatusFromError(e) === 404) return null;
    throw e;
  }
}

async function placeOrderRequest(o: AlpacaOrderRequest): Promise<AlpacaOrder> {
  assertAlpacaPaperTrading(BASE);
  return placeOrderWithReconcile<AlpacaOrder>(o.client_order_id, {
    submit: () => post<AlpacaOrder>(`${BASE}/v2/orders`, o, { trading: true }),
    lookupByClientOrderId: (id) => getOrderByClientOrderId(id),
  });
=======
function fetchSignal(): AbortSignal | undefined {
  if (typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ALPACA_FETCH_TIMEOUT_MS);
  }
  return undefined;
}

async function tradingFetch(url: string, init: RequestInit, trading = false): Promise<Response> {
  if (trading) assertAlpacaPaperTrading(BASE);
  const signal = fetchSignal();
  try {
    return await fetch(url, { ...init, headers: headers(), cache: 'no-store', signal });
  } catch (e) {
    if (isAbortTimeoutError(e)) {
      const err = new Error(`Alpaca fetch timeout ${url}`);
      err.name = 'TimeoutError';
      throw err;
    }
    throw e;
  }
}

async function get<T>(url: string, trading = false): Promise<T> {
  const res = await tradingFetch(url, { method: 'GET' }, trading);
  if (!res.ok) throw new Error(`Alpaca ${url}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function getOrderByClientOrderId(clientOrderId: string): Promise<AlpacaOrder | null> {
  const url = `${BASE}/v2/orders:by_client_order_id/${encodeURIComponent(clientOrderId)}`;
  const res = await tradingFetch(url, { method: 'GET' }, true);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Alpaca GET ${url}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<AlpacaOrder>;
}

async function post<T>(url: string, body: unknown, options?: { trading?: boolean; clientOrderId?: string }): Promise<T> {
  const trading = options?.trading ?? false;
  const clientOrderId = options?.clientOrderId;
  try {
    const res = await tradingFetch(
      url,
      { method: 'POST', body: JSON.stringify(body) },
      trading,
    );
    if (!res.ok) {
      const status = res.status;
      const text = await res.text();
      if (clientOrderId && shouldRecoverOrderPostError(status, false)) {
        const existing = await getOrderByClientOrderId(clientOrderId);
        if (existing) return existing as T;
      }
      throw new Error(`Alpaca POST ${url}: ${status} ${text}`);
    }
    return res.json();
  } catch (e) {
    if (clientOrderId) {
      const status = e instanceof Error ? parseAlpacaHttpStatus(e.message) : null;
      const timeout = isAbortTimeoutError(e) || (e instanceof Error && e.name === 'TimeoutError');
      if (shouldRecoverOrderPostError(status, timeout)) {
        const existing = await getOrderByClientOrderId(clientOrderId);
        if (existing) return existing as T;
      }
    }
    throw e;
  }
}

async function del<T>(url: string, options?: { trading?: boolean }): Promise<T> {
  const res = await tradingFetch(url, { method: 'DELETE' }, options?.trading ?? false);
  if (!res.ok) throw new Error(`Alpaca DELETE ${url}: ${res.status} ${await res.text()}`);
  return res.json();
>>>>>>> 8f2f496 (feat(etf): idempotent Alpaca order POSTs with client_order_id)
}

export const alpaca = {
  account: () => get<AlpacaAccount>(`${BASE}/v2/account`, true),
  positions: () => get<AlpacaPosition[]>(`${BASE}/v2/positions`, true),
  closePosition: (symbol: string) =>
    del<unknown>(alpacaPositionCloseUrl(BASE, symbol), { trading: true }),
  cancelAllOrders: () => del<{ id: number }[]>(`${BASE}/v2/orders`, { trading: true }),
  orders: (limit = 50) => get<AlpacaOrder[]>(`${BASE}/v2/orders?status=all&limit=${limit}&direction=desc`, true),
  openOrders: (limit = 100) =>
<<<<<<< HEAD
    get<AlpacaOrder[]>(`${BASE}/v2/orders?status=open&limit=${limit}&direction=desc`),
  getOrder: (orderId: string) => get<AlpacaOrder>(`${BASE}/v2/orders/${orderId}`),
  cancelOrder: (orderId: string) =>
    del<unknown>(`${BASE}/v2/orders/${orderId}`, { trading: true }),
  placeOrder: (o: AlpacaOrderRequest) => placeOrderRequest(o),
  getOrderByClientOrderId,
  clock: () => get<AlpacaClock>(`${BASE}/v2/clock`),
=======
    get<AlpacaOrder[]>(`${BASE}/v2/orders?status=open&limit=${limit}&direction=desc`, true),
  getOrderByClientOrderId,
  placeOrder: (o: AlpacaOrderRequest) =>
    post<AlpacaOrder>(`${BASE}/v2/orders`, o, { trading: true, clientOrderId: o.client_order_id }),
  clock: () => get<AlpacaClock>(`${BASE}/v2/clock`, true),
>>>>>>> 8f2f496 (feat(etf): idempotent Alpaca order POSTs with client_order_id)
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
      true,
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
  qty_available?: string;
  avg_entry_price: string;
  current_price: string;
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  unrealized_intraday_pl: string;
  unrealized_intraday_plpc: string;
  side: string;
  asset_class: string;
  /** Fractional day change (e.g. -0.05), not USD. */
  change_today: string;
  qty_available: string;
}

export interface AlpacaOrder {
  id: string;
  client_order_id?: string;
  symbol: string;
  side: string;
  asset_class?: string;
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
  client_order_id?: string;
}

export interface AlpacaClock {
  timestamp: string;
  is_open: boolean;
  next_open: string;
  next_close: string;
}

export type { AlpacaBar } from './alpaca-types';

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
