import type { Bar } from './types';

export function sma(closes: number[], n: number): number | null {
  if (closes.length < n) return null;
  let s = 0;
  for (let i = closes.length - n; i < closes.length; i++) s += closes[i]!;
  return s / n;
}

/** Rendement over n dagen: close[t] / close[t-n] - 1. */
export function momentum(closes: number[], n: number): number | null {
  if (closes.length < n + 1) return null;
  const prev = closes[closes.length - 1 - n]!;
  if (prev <= 0) return null;
  return closes[closes.length - 1]! / prev - 1;
}

/** Standaarddeviatie van dagelijkse enkelvoudige rendementen over de laatste n dagen. */
export function dailyVol(closes: number[], n: number): number | null {
  if (closes.length < n + 1) return null;
  const rets: number[] = [];
  for (let i = closes.length - n; i < closes.length; i++) {
    const p = closes[i - 1]!;
    if (p <= 0) return null;
    rets.push(closes[i]! / p - 1);
  }
  const mean = rets.reduce((a, r) => a + r, 0) / rets.length;
  const variance = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1 || 1);
  return Math.sqrt(variance);
}

export const closesOf = (bars: Bar[]): number[] => bars.map((b) => b.c);
export const dateOf = (b: Bar): string => b.t.slice(0, 10);

/** Wilder ATR over de laatste n volledige dagen (true range op OHLC). */
export function atrWilder(bars: Bar[], n = 14): number | null {
  if (bars.length < n + 1) return null;
  let prevClose = bars[bars.length - n - 1]!.c;
  const trs: number[] = [];
  for (let i = bars.length - n; i < bars.length; i++) {
    const b = bars[i]!;
    const tr = Math.max(b.h - b.l, Math.abs(b.h - prevClose), Math.abs(b.l - prevClose));
    trs.push(tr);
    prevClose = b.c;
  }
  return trs.reduce((a, x) => a + x, 0) / trs.length;
}
