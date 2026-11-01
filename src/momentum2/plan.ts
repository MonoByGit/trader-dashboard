import { equityOf } from './book';
import { sizingBase } from './risk';
import { targetWeights, type TargetWeight } from './signals';
import type { Bar, OrderIntent, VersionBook, VersionConfig, VetoFn, VetoVerdict } from './types';

export interface RebalancePlan {
  orders: OrderIntent[];
  targets: TargetWeight[];
  vetoes: Array<{ symbol: string; verdict: VetoVerdict }>;
}

/**
 * Rebalance-besluit op de slotkoersen van vandaag. Orders worden pas de volgende open uitgevoerd
 * (posities gaan over nacht). Een veto verwijdert alleen een NIEUWE instap; het vrijgekomen gewicht
 * blijft cash, het wordt niet naar een ander ETF verschoven.
 */
export async function planRebalance(input: {
  barsBySymbol: Record<string, Bar[]>;
  book: VersionBook;
  cfg: VersionConfig;
  veto?: VetoFn;
}): Promise<RebalancePlan> {
  const { barsBySymbol, book, cfg } = input;
  const prices: Record<string, number> = {};
  for (const s of Array.from(new Set([...cfg.universe, ...Object.keys(book.positions)]))) {
    const b = barsBySymbol[s];
    if (b?.length) prices[s] = b[b.length - 1]!.c;
  }
  const orders: OrderIntent[] = [];

  if (book.halted) {
    for (const [symbol, p] of Object.entries(book.positions)) {
      orders.push({ symbol, side: 'sell', qty: p.qty, reason: `versie dicht: ${book.haltReason ?? 'verliesgrens'}` });
    }
    return { orders, targets: [], vetoes: [] };
  }

  const targets = targetWeights(barsBySymbol, cfg);
  const vetoes: RebalancePlan['vetoes'] = [];
  const kept: TargetWeight[] = [];
  for (const t of targets) {
    if (!book.positions[t.symbol] && cfg.vetoEnabled && input.veto) {
      const verdict = await input.veto({
        symbol: t.symbol,
        momentum: t.momentum,
        weight: t.weight,
        lastClose: t.lastClose,
        sma: t.sma,
      });
      vetoes.push({ symbol: t.symbol, verdict });
      if (verdict.veto) continue;
    }
    kept.push(t);
  }

  const equity = equityOf(book, prices);
  const base = sizingBase(equity, book, cfg);
  const keptSet = new Set(kept.map((t) => t.symbol));

  for (const [symbol, p] of Object.entries(book.positions)) {
    if (!keptSet.has(symbol)) {
      orders.push({ symbol, side: 'sell', qty: p.qty, reason: 'rotatie: niet meer in top of filter' });
    }
  }
  for (const t of kept) {
    const want = base * t.weight;
    const pos = book.positions[t.symbol];
    const have = pos ? pos.qty * t.lastClose : 0;
    if (!pos) {
      orders.push({ symbol: t.symbol, side: 'buy', notionalUsd: want, reason: 'rotatie: nieuw in top' });
    } else if (want > 0 && Math.abs(want - have) / want > cfg.driftTolerance) {
      if (want > have) orders.push({ symbol: t.symbol, side: 'buy', notionalUsd: want - have, reason: 'herweging' });
      else orders.push({ symbol: t.symbol, side: 'sell', qty: Math.floor((have - want) / t.lastClose), reason: 'herweging' });
    }
  }
  // Verkopen eerst, zodat het cash vrijkomt voor de koopacties.
  orders.sort((a, b) => (a.side === b.side ? 0 : a.side === 'sell' ? -1 : 1));
  return { orders: orders.filter((o) => o.side === 'buy' || (o.qty ?? 0) > 0), targets: kept, vetoes };
}
