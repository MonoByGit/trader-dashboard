type CryptoPositionPnl = {
  change_today?: string | number;
  unrealized_intraday_pl?: string | number;
};

type OrderFillLike = {
  symbol: string;
  side: string;
  status: string;
  filled_at?: string | null;
  filled_avg_price?: string | null;
  filled_qty?: string | null;
  qty?: string | null;
};

export const CRYPTO_SELL_FEE_PCT = 0.0025;

function num(v: string | number | null | undefined): number {
  if (v === undefined || v === null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function dayStartUtcIso(todayUtcYmd: string): string {
  return `${todayUtcYmd}T00:00:00.000Z`;
}

type BuyLot = { filledAt: string; qtyRemaining: number; buyPrice: number };

function referencePriceForLot(
  lot: BuyLot,
  dayStart: string,
  yesterdayCloseBySymbol: Record<string, number>,
  symbol: string,
): number {
  if (lot.filledAt >= dayStart) return lot.buyPrice;
  const yc = yesterdayCloseBySymbol[symbol];
  if (yc > 0) return yc;
  return lot.buyPrice;
}

/** Sum Alpaca crypto position unrealized_intraday_pl (USD). Ignores change_today (fraction). */
export function sumCryptoUnrealizedIntradayPlUsd(positions: CryptoPositionPnl[]): number {
  let total = 0;
  for (const p of positions) {
    total += num(p.unrealized_intraday_pl);
  }
  return total;
}

/**
 * Realized P&L for UTC calendar day: FIFO vs reference at max(buy time, 00:00Z).
 * Overnight lots use yesterdayCloseBySymbol at day start; same-day buys use fill price.
 * Subtracts sell fee (0.25% of exit notional) per fill.
 */
export function sumCryptoRealizedPlTodayUsd(
  orders: OrderFillLike[],
  opts: {
    todayUtcYmd: string;
    isCryptoSymbol: (symbol: string) => boolean;
    yesterdayCloseBySymbol?: Record<string, number>;
    sellFeePct?: number;
  },
): number {
  const dayStart = dayStartUtcIso(opts.todayUtcYmd);
  const yesterdayCloseBySymbol = opts.yesterdayCloseBySymbol ?? {};
  const sellFeePct = opts.sellFeePct ?? CRYPTO_SELL_FEE_PCT;
  const filled = orders.filter((o) => o.status === 'filled' && o.filled_at);

  const lotsBySymbol = new Map<string, BuyLot[]>();
  for (const o of filled) {
    if (o.side !== 'buy' || !opts.isCryptoSymbol(o.symbol)) continue;
    const qty = num(o.filled_qty ?? o.qty);
    const price = num(o.filled_avg_price);
    if (!qty || !price) continue;
    const list = lotsBySymbol.get(o.symbol) ?? [];
    list.push({ filledAt: o.filled_at!, qtyRemaining: qty, buyPrice: price });
    lotsBySymbol.set(o.symbol, list);
  }
  for (const list of Array.from(lotsBySymbol.values())) {
    list.sort((a: BuyLot, b: BuyLot) => a.filledAt.localeCompare(b.filledAt));
  }

  let total = 0;
  for (const o of filled) {
    if (o.side !== 'sell' || !o.filled_at!.startsWith(opts.todayUtcYmd)) continue;
    if (!opts.isCryptoSymbol(o.symbol)) continue;
    const exit = num(o.filled_avg_price);
    let sellQty = num(o.filled_qty ?? o.qty);
    if (!exit || !sellQty) continue;

    const lots = lotsBySymbol.get(o.symbol) ?? [];
    let pl = 0;
    let matchedQty = 0;
    while (sellQty > 0) {
      const lot = lots.find((l) => l.qtyRemaining > 0);
      if (lot) {
        const take = Math.min(sellQty, lot.qtyRemaining);
        const ref = referencePriceForLot(lot, dayStart, yesterdayCloseBySymbol, o.symbol);
        pl += (exit - ref) * take;
        matchedQty += take;
        lot.qtyRemaining -= take;
        sellQty -= take;
        continue;
      }
      const yc = yesterdayCloseBySymbol[o.symbol];
      if (yc > 0) {
        pl += (exit - yc) * sellQty;
        matchedQty += sellQty;
        sellQty = 0;
      } else {
        break;
      }
    }
    if (matchedQty <= 0) continue;
    const notional = exit * matchedQty;
    total += pl - notional * sellFeePct;
  }
  return total;
}

/** Daily crypto P&L in USD: unrealized intraday + realized from today's sells. */
export function computeCryptoDailyPnlUsd(input: {
  positions: CryptoPositionPnl[];
  realizedPlUsdToday: number;
}): number {
  return sumCryptoUnrealizedIntradayPlUsd(input.positions) + input.realizedPlUsdToday;
}

/** Loss as % of total account equity (positive number = loss). */
export function cryptoDailyLossPctOfAccount(
  totalEquityUsd: number,
  cryptoDailyPnlUsd: number,
): number {
  if (totalEquityUsd <= 0) return 0;
  if (cryptoDailyPnlUsd >= 0) return 0;
  return (-cryptoDailyPnlUsd / totalEquityUsd) * 100;
}

/** change_today is a fraction (e.g. -0.05), not USD — must not be summed as dollars. */
export function changeTodayIsFractionNotUsd(changeToday: string): boolean {
  const n = parseFloat(changeToday);
  return Number.isFinite(n) && Math.abs(n) <= 1;
}
