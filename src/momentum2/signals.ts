import { closesOf, dailyVol, momentum, sma } from './indicators';
import type { Bar, VersionConfig } from './types';

export interface RankedEtf {
  symbol: string;
  momentum: number;
  lastClose: number;
  sma: number;
  vol: number;
}

export interface TargetWeight extends RankedEtf {
  /** Aandeel van de beleggingsruimte (som <= 1). */
  weight: number;
}

/**
 * ETF's die het 200-daags filter halen en positief momentum hebben, gerangschikt
 * op momentum (hoogste eerst). Alleen bars tot en met de beslisdag gebruiken.
 */
export function rankUniverse(
  barsBySymbol: Record<string, Bar[]>,
  cfg: Pick<VersionConfig, 'universe' | 'lookbackDays' | 'smaDays' | 'volDays'>,
): RankedEtf[] {
  const out: RankedEtf[] = [];
  for (const symbol of cfg.universe) {
    const closes = closesOf(barsBySymbol[symbol] ?? []);
    const s = sma(closes, cfg.smaDays);
    const m = momentum(closes, cfg.lookbackDays);
    const v = dailyVol(closes, cfg.volDays);
    if (s === null || m === null || v === null || v <= 0) continue;
    const last = closes[closes.length - 1]!;
    if (last <= s) continue; // trendfilter
    if (m <= 0) continue; // absoluut momentum
    out.push({ symbol, momentum: m, lastClose: last, sma: s, vol: v });
  }
  return out.sort((a, b) => b.momentum - a.momentum || a.symbol.localeCompare(b.symbol));
}

/** Top-N met gewichten omgekeerd evenredig met volatiliteit. Geen kandidaten = alles cash. */
export function targetWeights(
  barsBySymbol: Record<string, Bar[]>,
  cfg: Pick<VersionConfig, 'universe' | 'lookbackDays' | 'smaDays' | 'volDays' | 'topN'>,
): TargetWeight[] {
  const top = rankUniverse(barsBySymbol, cfg).slice(0, cfg.topN);
  const inv = top.map((r) => 1 / r.vol);
  const total = inv.reduce((a, x) => a + x, 0);
  if (total <= 0) return [];
  return top.map((r, i) => ({ ...r, weight: inv[i]! / total }));
}
