import { rsiWilder } from '../indicators/rsi';
import { closesOf, sma } from '../momentum2/indicators';
import type { Bar } from '../momentum2/types';
import type { M3Config } from './config';

export interface Entry { symbol: string; rsi: number; lastClose: number }

/** RSI(14) op de slotkoersen tot en met index i (geen look-ahead). */
export function rsiSeries(closes: number[], lastN: number): Array<number | null> {
  const out: Array<number | null> = [];
  for (let k = lastN - 1; k >= 0; k--) {
    const end = closes.length - k;
    out.push(end >= 15 ? rsiWilder(closes.slice(0, end), 14) : null);
  }
  return out;
}

/**
 * Mean-reversion instap: de RSI zat de afgelopen armDays onder de trigger én vandaag draait de koers
 * (slot boven het slot van gisteren, of de RSI kruist terug boven de trigger). ETF: alleen boven het 200d gemiddelde.
 * Gerangschikt op diepste RSI.
 */
export function entryCandidates(
  barsBySymbol: Record<string, Bar[]>,
  cfg: Pick<M3Config, 'universe' | 'rsiTrigger' | 'armDays' | 'requireTrend' | 'smaDays'>,
): Entry[] {
  const out: Entry[] = [];
  for (const symbol of cfg.universe) {
    const closes = closesOf(barsBySymbol[symbol] ?? []);
    if (closes.length < Math.max(16, cfg.smaDays) + 1) continue;
    const series = rsiSeries(closes, cfg.armDays + 1); // [.., gisteren, vandaag]
    const today = series[series.length - 1];
    const yday = series[series.length - 2];
    if (today == null || yday == null) continue;
    const window = series.slice(0, -1).filter((x): x is number => x != null);
    if (window.length === 0 || Math.min(...window) >= cfg.rsiTrigger) continue; // niet bewapend
    const last = closes[closes.length - 1]!;
    const prev = closes[closes.length - 2]!;
    const turned = last > prev || (yday < cfg.rsiTrigger && today >= cfg.rsiTrigger);
    if (!turned) continue;
    if (cfg.requireTrend) {
      const s = sma(closes, cfg.smaDays);
      if (s === null || last <= s) continue;
    }
    out.push({ symbol, rsi: Math.min(...window), lastClose: last });
  }
  return out.sort((a, b) => a.rsi - b.rsi || a.symbol.localeCompare(b.symbol));
}

export function currentRsi(bars: Bar[] | undefined): number | null {
  const c = closesOf(bars ?? []);
  return c.length >= 15 ? rsiWilder(c, 14) : null;
}
