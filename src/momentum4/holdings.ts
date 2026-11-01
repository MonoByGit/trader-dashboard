/** Portefeuille-snapshot (13F of andere bron) en kopieersignalen. */
export interface Holding {
  symbol: string;
  shares: number;
  /** Gewicht in procent van de portefeuille (0–100). */
  weightPct: number;
}

export interface HoldingsSnapshot {
  /** Rapportperiode (bij 13F: kwartaaleinde). */
  asOf: string;
  /** Datum waarop de holdings publiek werden (SEC filing date). */
  filedAt: string;
  fund: string;
  cik: string;
  holdings: Holding[];
}

export interface CopySignal {
  symbol: string;
  kind: 'open' | 'add' | 'reduce' | 'close';
  /** Verandering in aandelen als percentage van de vorige positie (open = 100). */
  changePct: number;
  weightPct: number;
  sourceFund: string;
}

/** Wat het fonds tussen twee opeenvolgende snapshots deed. Kleine ruis (< 0,5%) telt niet. */
export function diffHoldings(prev: HoldingsSnapshot, next: HoldingsSnapshot): CopySignal[] {
  const before = new Map(prev.holdings.map((h) => [h.symbol, h]));
  const after = new Map(next.holdings.map((h) => [h.symbol, h]));
  const out: CopySignal[] = [];
  const fund = next.fund;
  for (const [t, n] of Array.from(after.entries())) {
    const p = before.get(t);
    if (!p || p.shares <= 0) out.push({ symbol: t, kind: 'open', changePct: 100, weightPct: n.weightPct, sourceFund: fund });
    else {
      const ch = ((n.shares - p.shares) / p.shares) * 100;
      if (ch >= 0.5) out.push({ symbol: t, kind: 'add', changePct: ch, weightPct: n.weightPct, sourceFund: fund });
      else if (ch <= -0.5) out.push({ symbol: t, kind: 'reduce', changePct: ch, weightPct: n.weightPct, sourceFund: fund });
    }
  }
  for (const [t] of Array.from(before.entries())) {
    if (!after.has(t)) out.push({ symbol: t, kind: 'close', changePct: -100, weightPct: 0, sourceFund: fund });
  }
  return out.sort((a, b) => b.weightPct - a.weightPct || a.symbol.localeCompare(b.symbol));
}

/**
 * Signalen op de publieksdatum (filedAt): pas op die dag bekend, uitvoering volgt via simulate (open D+1).
 * Meerdere fondsen op dezelfde dag worden samengevoegd.
 */
export function signalsByFiledDate(filings: HoldingsSnapshot[]): Record<string, CopySignal[]> {
  const sorted = [...filings].sort((a, b) => a.filedAt.localeCompare(b.filedAt) || a.asOf.localeCompare(b.asOf));
  const out: Record<string, CopySignal[]> = {};
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const next = sorted[i]!;
    if (prev.cik !== next.cik) continue;
    const sigs = diffHoldings(prev, next);
    if (!sigs.length) continue;
    out[next.filedAt] = [...(out[next.filedAt] ?? []), ...sigs];
  }
  return out;
}

/** Meerdere fondsen: per CIK apart diffen, daarna per filedAt mergen. */
export function mergeFundSignals(byFund: HoldingsSnapshot[][]): Record<string, CopySignal[]> {
  const merged: Record<string, CopySignal[]> = {};
  for (const chain of byFund) {
    const part = signalsByFiledDate(chain);
    for (const [d, sigs] of Object.entries(part)) {
      merged[d] = [...(merged[d] ?? []), ...sigs];
    }
  }
  return merged;
}
