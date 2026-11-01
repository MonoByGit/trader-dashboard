import { rsi14 } from './rsi';

export interface LiveSymbolSnapshot {
  symbol: string;
  lastClose: number;
  sma20: number;
  aboveSma20: boolean;
  rsi: number;
  volumeRatio: number;
}

/** Daily-bar snapshot for premarket / market-open (last 20 sessions). */
export function snapshotFromDailyBars(
  symbol: string,
  bars: { c: number; v: number }[],
): LiveSymbolSnapshot | null {
  if (bars.length < 5) return null;
  const window = bars.slice(-20);
  const closes = window.map((x) => x.c);
  const sma20 = closes.reduce((a, v) => a + v, 0) / closes.length;
  const last = closes[closes.length - 1]!;
  const vols = window.map((x) => x.v);
  const prevVols = vols.slice(0, -1);
  const avgVol =
    prevVols.length > 0 ? prevVols.reduce((a, v) => a + v, 0) / prevVols.length : vols[vols.length - 1]!;
  const rsiVal = rsi14(closes);
  if (rsiVal == null) return null;
  return {
    symbol,
    lastClose: last,
    sma20: +sma20.toFixed(2),
    aboveSma20: last > sma20,
    rsi: rsiVal,
    volumeRatio: +(vols[vols.length - 1]! / avgVol).toFixed(2),
  };
}
