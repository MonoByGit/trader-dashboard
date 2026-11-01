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
