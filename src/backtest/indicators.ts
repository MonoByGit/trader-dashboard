import type { DailyBar } from './types';

export interface SymbolSnapshot {
  symbol: string;
  lastClose: number;
  sma20: number;
  aboveSma20: boolean;
  rsi: number;
  volumeRatio: number;
}

/** Indicators at index `barIndex` using only bars[0..barIndex] inclusive (no look-ahead). */
export function snapshotAtIndex(bars: DailyBar[], barIndex: number): SymbolSnapshot | null {
  if (barIndex < 4 || barIndex >= bars.length) return null;
  const slice = bars.slice(0, barIndex + 1);
  const window = slice.slice(-20);
  if (window.length < 5) return null;

  const closes = window.map((x) => x.c);
  const sma20 = closes.reduce((a, v) => a + v, 0) / closes.length;
  const last = closes[closes.length - 1]!;

  const vols = window.map((x) => x.v);
  const prevVols = vols.slice(0, -1);
  const avgVol =
    prevVols.length > 0 ? prevVols.reduce((a, v) => a + v, 0) / prevVols.length : vols[vols.length - 1]!;
  const volumeRatio = avgVol > 0 ? vols[vols.length - 1]! / avgVol : 0;

  const rsiCloses = closes.slice(-15);
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < rsiCloses.length; i++) {
    const d = rsiCloses[i]! - rsiCloses[i - 1]!;
    if (d >= 0) gains.push(d);
    else losses.push(-d);
  }
  const ag = gains.length ? gains.reduce((a, v) => a + v, 0) / 14 : 0;
  const al = losses.length ? losses.reduce((a, v) => a + v, 0) / 14 : 0;
  const rsi = al === 0 ? 100 : 100 - 100 / (1 + ag / al);

  return {
    symbol: '',
    lastClose: last,
    sma20: +sma20.toFixed(2),
    aboveSma20: last > sma20,
    rsi: +rsi.toFixed(1),
    volumeRatio: +(volumeRatio.toFixed(2)),
  };
}

export function barIndexByDate(bars: DailyBar[], date: string): number {
  return bars.findIndex((b) => barTradingDate(b) === date);
}

export function barTradingDate(bar: DailyBar): string {
  return bar.t.slice(0, 10);
}
