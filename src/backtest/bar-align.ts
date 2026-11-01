import type { DailyBar } from './types';
import { barTradingDate } from './indicators';

/** Latest bar on or before `dateYmd` (bars need not include every calendar day). */
export function barOnOrBefore(bars: DailyBar[], dateYmd: string): DailyBar | undefined {
  const sorted = [...bars].sort((a, b) => barTradingDate(a).localeCompare(barTradingDate(b)));
  let best: DailyBar | undefined;
  for (const b of sorted) {
    const d = barTradingDate(b);
    if (d <= dateYmd) best = b;
    else break;
  }
  return best;
}

/** One bar per trading date for buy-and-hold benchmark (forward-filled close when missing). */
export function alignBenchmarkBarsToTradingDates(
  tradingDates: string[],
  bars: DailyBar[],
): DailyBar[] {
  const sorted = [...bars].sort((a, b) => barTradingDate(a).localeCompare(barTradingDate(b)));
  const out: DailyBar[] = [];
  let i = 0;
  let last: DailyBar | undefined;

  for (const date of tradingDates) {
    while (i < sorted.length && barTradingDate(sorted[i]!) <= date) {
      last = sorted[i];
      i += 1;
    }
    if (!last) continue;
    const d = barTradingDate(last);
    if (d === date) {
      out.push({ ...last, t: `${date}T00:00:00Z` });
    } else {
      const c = last.c;
      out.push({ t: `${date}T00:00:00Z`, o: c, h: c, l: c, c, v: 0 });
    }
  }
  return out;
}
