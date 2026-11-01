import { rsiWilder } from '../indicators/rsi';
import { closesOf, dateOf, sma } from '../momentum2/indicators';
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

/** Aandeel van `calendarDates` waar symbool een dagbar heeft (laatste `lookback` dagen). */
export function recentBarCoverage(
  bars: Bar[],
  calendarDates: string[],
  lookback = 30,
): number {
  if (calendarDates.length === 0) return 0;
  const slice = calendarDates.slice(-lookback);
  const have = new Set(bars.map(dateOf));
  const hit = slice.filter((d) => have.has(d)).length;
  return hit / slice.length;
}

function roundTripCostPct(cfg: Pick<M3Config, 'feeBps'>, slippageBps = 2): number {
  return ((cfg.feeBps ?? 0) + slippageBps) * 2 / 10000;
}

/**
 * Mean-reversion instap: RSI onder trigger in arm-periode, vandaag draai, voldoende dip vs. kosten,
 * en voldoende bar-dekking. ETF: alleen boven het 200d gemiddelde.
 */
export function entryCandidates(
  barsBySymbol: Record<string, Bar[]>,
  cfg: Pick<
    M3Config,
    | 'universe'
    | 'rsiTrigger'
    | 'armDays'
    | 'requireTrend'
    | 'smaDays'
    | 'minDipPct'
    | 'minRecentBarCoverage'
    | 'minEdgeCostMultiple'
    | 'feeBps'
    | 'hardStopPct'
  >,
  calendarDates?: string[],
): Entry[] {
  const out: Entry[] = [];
  const minMove = roundTripCostPct(cfg) * cfg.minEdgeCostMultiple;
  for (const symbol of cfg.universe) {
    const bars = barsBySymbol[symbol] ?? [];
    const closes = closesOf(bars);
    if (closes.length < Math.max(16, cfg.smaDays) + 1) continue;
    if (calendarDates && recentBarCoverage(bars, calendarDates) < cfg.minRecentBarCoverage) continue;
    const series = rsiSeries(closes, cfg.armDays + 1);
    const today = series[series.length - 1];
    const yday = series[series.length - 2];
    if (today == null || yday == null) continue;
    const window = series.slice(0, -1).filter((x): x is number => x != null);
    if (window.length === 0 || Math.min(...window) >= cfg.rsiTrigger) continue;
    const last = closes[closes.length - 1]!;
    const prev = closes[closes.length - 2]!;
    const turned = last > prev || (yday < cfg.rsiTrigger && today >= cfg.rsiTrigger);
    if (!turned) continue;
    const armSlice = closes.slice(-(cfg.armDays + 5), -1);
    const peak = armSlice.length ? Math.max(...armSlice) : prev;
    const dip = peak > 0 ? (peak - Math.min(...armSlice, last)) / peak : 0;
    if (dip < Math.max(cfg.minDipPct, minMove)) continue;
    if (dip < cfg.hardStopPct * 0.35) continue;
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
