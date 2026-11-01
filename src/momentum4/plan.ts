import { equityOf } from '../momentum2/book';
import type { StrategyHooks } from '../momentum2/hooks';
import { sizingBase } from '../momentum2/risk';
import type { Bar, OrderIntent, VersionBook } from '../momentum2/types';
import type { CopySignal } from './holdings';
import type { M4Config } from './config';

/**
 * Volg 13F-filings op publieksdatum D: besluit na close D, order op open D+1 (via simulate/live).
 * Instap bij 'open' of 'add' ≥ minAddPct; uitstap bij 'close' of 'reduce' ≥ exitReducePct.
 */
export function planM4(input: { signals: CopySignal[]; barsBySymbol: Record<string, Bar[]>; book: VersionBook; cfg: M4Config }): { orders: OrderIntent[] } {
  const { signals, barsBySymbol, book, cfg } = input;
  const orders: OrderIntent[] = [];
  if (book.halted) {
    for (const [symbol, p] of Object.entries(book.positions)) orders.push({ symbol, side: 'sell', qty: p.qty, reason: `versie dicht: ${book.haltReason ?? 'verliesgrens'}` });
    return { orders };
  }
  const held = new Set(Object.keys(book.positions));
  for (const s of signals) {
    const p = book.positions[s.symbol];
    if (!p) continue;
    if (s.kind === 'close' || (s.kind === 'reduce' && -s.changePct >= cfg.exitReducePct)) {
      orders.push({ symbol: s.symbol, side: 'sell', qty: p.qty, reason: `13F ${s.kind === 'close' ? 'sluit' : `verkoopt ${(-s.changePct).toFixed(0)}%`} (${s.sourceFund})` });
      held.delete(s.symbol);
    }
  }
  const prices: Record<string, number> = {};
  for (const [s, b] of Object.entries(barsBySymbol)) if (b.length) prices[s] = b[b.length - 1]!.c;
  const base = sizingBase(equityOf(book, prices), book, cfg);
  let slots = cfg.topN - held.size;
  for (const s of signals) {
    if (slots <= 0) break;
    if (held.has(s.symbol) || !(s.kind === 'open' || (s.kind === 'add' && s.changePct >= cfg.minAddPct))) continue;
    if (s.weightPct < cfg.minWeightPct || !barsBySymbol[s.symbol]?.length) continue;
    orders.push({ symbol: s.symbol, side: 'buy', notionalUsd: base * cfg.positionPct, reason: `13F ${s.kind === 'open' ? 'opent' : `vergroot ${s.changePct.toFixed(0)}%`} (${s.sourceFund})` });
    slots--;
  }
  orders.sort((a, b) => (a.side === b.side ? 0 : a.side === 'sell' ? -1 : 1));
  return { orders };
}

/** Datum van vandaag = laatste SPY-bar (SPY zit altijd in barsBySymbol als benchmark). */
export function makeM4Hooks(signalsOn: (date: string) => CopySignal[]): StrategyHooks<M4Config> {
  return {
    stopFor: (pos, cfg) => {
      const hard = pos.entryPrice * (1 - cfg.hardStopPct);
      const trail = pos.highWater * (1 - cfg.trailingStopPct);
      return trail > hard ? { level: trail, kind: 'trailing' } : { level: hard, kind: 'hard' };
    },
    plan: async ({ barsBySymbol, book, cfg }) => {
      const date = barsBySymbol.SPY?.at(-1)?.t.slice(0, 10) ?? '';
      return { ...planM4({ signals: signalsOn(date), barsBySymbol, book, cfg }), vetoes: [] };
    },
  };
}
