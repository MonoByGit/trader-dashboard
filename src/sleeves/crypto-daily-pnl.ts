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

function num(v: string | number | null | undefined): number {
  if (v === undefined || v === null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/** Sum Alpaca crypto position unrealized_intraday_pl (USD). Ignores change_today (fraction). */
export function sumCryptoUnrealizedIntradayPlUsd(positions: CryptoPositionPnl[]): number {
  let total = 0;
  for (const p of positions) {
    total += num(p.unrealized_intraday_pl);
  }
  return total;
}

/** Realized P&L today from filled crypto sells vs most recent prior buy (USD, signed). */
export function sumCryptoRealizedPlTodayUsd(
  orders: OrderFillLike[],
  opts: { todayUtcYmd: string; isCryptoSymbol: (symbol: string) => boolean },
): number {
  let total = 0;
  const filled = orders.filter((o) => o.status === 'filled' && o.filled_at);
  for (const o of filled) {
    if (o.side !== 'sell' || !o.filled_at!.startsWith(opts.todayUtcYmd)) continue;
    if (!opts.isCryptoSymbol(o.symbol)) continue;
    const exit = num(o.filled_avg_price);
    const qty = num(o.filled_qty ?? o.qty);
    if (!exit || !qty) continue;
    const buys = filled
      .filter(
        (b) =>
          b.side === 'buy' &&
          b.symbol === o.symbol &&
          b.filled_at &&
          b.filled_at <= o.filled_at!,
      )
      .sort((a, b) => (b.filled_at ?? '').localeCompare(a.filled_at ?? ''));
    const entry = buys.length ? num(buys[0].filled_avg_price) : exit;
    total += (exit - entry) * qty;
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
