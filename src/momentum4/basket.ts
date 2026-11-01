import type { CopySignal, HoldingsSnapshot } from './holdings';

export type BasketWeightMode = 'equal' | 'conviction';

export interface BasketTarget {
  symbol: string;
  /** Aandeel van het inzetbare budget (0–1), som = 1 over targets. */
  allocPct: number;
}

/** Laatste snapshot per fonds met filedAt ≤ date. */
export function latestSnapshotsAsOf(chains: HoldingsSnapshot[][], date: string): HoldingsSnapshot[] {
  const out: HoldingsSnapshot[] = [];
  for (const chain of chains) {
    let pick: HoldingsSnapshot | null = null;
    for (const s of chain) {
      if (s.filedAt <= date && (!pick || s.filedAt > pick.filedAt)) pick = s;
    }
    if (pick) out.push(pick);
  }
  return out;
}

/** Alle unieke filedAt-datums waar minstens één fonds een snapshot heeft. */
export function allFilingDates(chains: HoldingsSnapshot[][]): string[] {
  const d = new Set<string>();
  for (const chain of chains) for (const s of chain) d.add(s.filedAt);
  return [...d].sort();
}

/**
 * Top-N namen over het mandje: conviction = som gewicht% over fondsen; equal = top-N op conviction-rang, gelijk verdeeld.
 */
export function buildBasketTargets(
  snapshots: HoldingsSnapshot[],
  maxNames: number,
  mode: BasketWeightMode,
): BasketTarget[] {
  const score = new Map<string, number>();
  for (const snap of snapshots) {
    for (const h of snap.holdings) {
      score.set(h.symbol, (score.get(h.symbol) ?? 0) + h.weightPct);
    }
  }
  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, maxNames);
  if (!ranked.length) return [];
  if (mode === 'equal') {
    const w = 1 / ranked.length;
    return ranked.map(([symbol]) => ({ symbol, allocPct: w }));
  }
  const total = ranked.reduce((s, [, v]) => s + v, 0) || 1;
  return ranked.map(([symbol, v]) => ({ symbol, allocPct: v / total }));
}

/** Op elke gezamenlijke filing-dag: rebalance-signalen (close buiten mandje, open/aanpassing binnen). */
export function basketSignalsByFiledDate(
  chains: HoldingsSnapshot[][],
  maxNames: number,
  mode: BasketWeightMode,
): Record<string, CopySignal[]> {
  const out: Record<string, CopySignal[]> = {};
  let prev = new Set<string>();
  for (const date of allFilingDates(chains)) {
    const snaps = latestSnapshotsAsOf(chains, date);
    const targets = buildBasketTargets(snaps, maxNames, mode);
    const next = new Set(targets.map((t) => t.symbol));
    const sigs: CopySignal[] = [];
    for (const sym of prev) {
      if (!next.has(sym)) sigs.push({ symbol: sym, kind: 'close', changePct: -100, weightPct: 0, sourceFund: 'basket' });
    }
    for (const t of targets) {
      const kind = prev.has(t.symbol) ? 'add' : 'open';
      sigs.push({
        symbol: t.symbol,
        kind,
        changePct: kind === 'open' ? 100 : 5,
        weightPct: t.allocPct * 100,
        sourceFund: 'basket',
      });
    }
    if (sigs.length) out[date] = sigs;
    prev = next;
  }
  return out;
}

/** Alleen nieuwe `open`-signalen uit diff-merge; geen 13F-gestuurde verkopen. */
export function filterNewPositionsOnly(signals: Record<string, CopySignal[]>): Record<string, CopySignal[]> {
  const out: Record<string, CopySignal[]> = {};
  for (const [d, sigs] of Object.entries(signals)) {
    const opens = sigs.filter((s) => s.kind === 'open');
    if (opens.length) out[d] = opens;
  }
  return out;
}
