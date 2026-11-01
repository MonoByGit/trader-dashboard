import type { EquityLogRow, TradeLogRow, VersionBook, VersionConfig } from './types';

export function newBook(cfg: VersionConfig, startDate: string | null, spyPrice: number | null): VersionBook {
  return {
    versionId: cfg.id,
    startDate,
    startBudgetUsd: cfg.budgetUsd,
    startSpyPrice: spyPrice,
    cash: cfg.budgetUsd,
    positions: {},
    peakEquity: cfg.budgetUsd,
    halted: false,
    haltReason: null,
    lastRebalanceIndex: null,
  };
}

export function exposureOf(book: VersionBook, prices: Record<string, number>): number {
  let x = 0;
  for (const [sym, p] of Object.entries(book.positions)) x += p.qty * (prices[sym] ?? p.entryPrice);
  return x;
}

export const equityOf = (book: VersionBook, prices: Record<string, number>): number =>
  book.cash + exposureOf(book, prices);

export function applyBuy(
  book: VersionBook,
  symbol: string,
  qty: number,
  price: number,
  date: string,
  reason: string,
  opts?: { signalDate?: string; /** Broker-fill: altijd boeken, ook als slippage de kas iets negatief maakt. */ brokerFill?: boolean },
): TradeLogRow | null {
  if (qty <= 0) return null;
  if (!opts?.brokerFill && qty * price > book.cash + 1e-9) return null;
  book.cash -= qty * price;
  const cur = book.positions[symbol];
  if (cur) {
    const total = cur.qty + qty;
    cur.entryPrice = (cur.entryPrice * cur.qty + price * qty) / total;
    cur.qty = total;
    cur.highWater = Math.max(cur.highWater, price);
  } else {
    book.positions[symbol] = {
      qty,
      entryPrice: price,
      entryDate: date,
      highWater: price,
      signalDate: opts?.signalDate ?? date,
    };
  }
  return { date, symbol, side: 'buy', qty, price, reason };
}

export function applySell(
  book: VersionBook,
  symbol: string,
  qty: number,
  price: number,
  date: string,
  reason: string,
): TradeLogRow | null {
  const cur = book.positions[symbol];
  if (!cur || qty <= 0) return null;
  const q = Math.min(qty, cur.qty);
  book.cash += q * price;
  const pnl = (price - cur.entryPrice) * q;
  cur.qty -= q;
  if (cur.qty <= 1e-9) {
    delete book.positions[symbol];
    (book.lastExit ??= {})[symbol] = date;
  }
  return { date, symbol, side: 'sell', qty: q, price, reason, pnl };
}

/** Dagregel versus SPY (buy-and-hold geschaald naar het startbudget van de versie). */
export function logRow(
  book: VersionBook,
  date: string,
  prices: Record<string, number>,
  spyPrice: number,
): EquityLogRow {
  const equity = equityOf(book, prices);
  const spyEquity =
    book.startSpyPrice && book.startSpyPrice > 0
      ? book.startBudgetUsd * (spyPrice / book.startSpyPrice)
      : book.startBudgetUsd;
  const ret = (equity / book.startBudgetUsd - 1) * 100;
  const spyRet = (spyEquity / book.startBudgetUsd - 1) * 100;
  return {
    date,
    equity,
    cash: book.cash,
    exposure: equity - book.cash,
    spyEquity,
    excessVsSpyPct: ret - spyRet,
  };
}
