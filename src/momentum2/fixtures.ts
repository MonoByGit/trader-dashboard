import type { Bar } from './types';

/** Synthetische reeks: start + dagelijkse drift, met optionele sinus voor volatiliteit. */
export function makeBars(n: number, start: number, drift: number, wiggle = 0, startDate = '2024-01-01'): Bar[] {
  const out: Bar[] = [];
  const d0 = new Date(`${startDate}T00:00:00Z`).getTime();
  let c = start;
  for (let i = 0; i < n; i++) {
    const prev = c;
    c = start * Math.pow(1 + drift, i + 1) * (1 + wiggle * Math.sin(i / 3));
    const o = prev;
    out.push({
      t: new Date(d0 + i * 86400000).toISOString().slice(0, 10),
      o,
      h: Math.max(o, c) * 1.002,
      l: Math.min(o, c) * 0.998,
      c,
      v: 1_000_000,
    });
  }
  return out;
}
