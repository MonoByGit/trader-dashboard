import type { AlpacaOrder, AlpacaPosition } from '@/lib/alpaca';
import { computeCryptoDailyPnlUsd, sumCryptoRealizedPlTodayUsd } from '../../../src/sleeves/crypto-daily-pnl';
import { classifySymbol } from '@/lib/asset-class';

export function cryptoDailyPnlFromLive(
  cryptoPositions: AlpacaPosition[],
  orders: AlpacaOrder[],
  nowMs = Date.now(),
): number {
  const todayUtcYmd = new Date(nowMs).toISOString().slice(0, 10);
  const realized = sumCryptoRealizedPlTodayUsd(orders, {
    todayUtcYmd,
    isCryptoSymbol: (symbol) => classifySymbol(symbol) === 'crypto',
  });
  return computeCryptoDailyPnlUsd({
    positions: cryptoPositions,
    realizedPlUsdToday: realized,
  });
}
