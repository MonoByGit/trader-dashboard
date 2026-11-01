import type { AlpacaOrder, AlpacaPosition } from '@/lib/alpaca';
import { computeCryptoDailyPnlUsd, sumCryptoRealizedPlTodayUsd } from '../../../src/sleeves/crypto-daily-pnl';
import { classifySymbol } from '@/lib/asset-class';

/** Prior UTC day close from daily bars (second-to-last bar when today is included). */
export function yesterdayUtcCloseBySymbol(bars: Record<string, { c: number }[]>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [symbol, series] of Object.entries(bars)) {
    if (!series?.length) continue;
    if (series.length >= 2) out[symbol] = series[series.length - 2].c;
    else out[symbol] = series[0].c;
  }
  return out;
}

export function cryptoDailyPnlFromLive(
  cryptoPositions: AlpacaPosition[],
  orders: AlpacaOrder[],
  opts?: {
    nowMs?: number;
    yesterdayCloseBySymbol?: Record<string, number>;
  },
): number {
  const nowMs = opts?.nowMs ?? Date.now();
  const todayUtcYmd = new Date(nowMs).toISOString().slice(0, 10);
  const realized = sumCryptoRealizedPlTodayUsd(orders, {
    todayUtcYmd,
    isCryptoSymbol: (symbol) => classifySymbol(symbol) === 'crypto',
    yesterdayCloseBySymbol: opts?.yesterdayCloseBySymbol,
  });
  return computeCryptoDailyPnlUsd({
    positions: cryptoPositions,
    realizedPlUsdToday: realized,
  });
}
