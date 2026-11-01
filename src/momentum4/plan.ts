import { equityOf } from '../momentum2/book';
import type { StrategyHooks } from '../momentum2/hooks';
import { sizingBase } from '../momentum2/risk';
import type { Bar, OrderIntent, VersionBook } from '../momentum2/types';
import type { CopySignal } from './holdings';
import type { M4Config } from './config';

function planM4Diff(input: { signals: CopySignal[]; barsBySymbol: Record<string, Bar[]>; book: VersionBook; cfg: M4Config }): { orders: OrderIntent[] } {
  const { signals, barsBySymbol, book, cfg } = input;
  const orders: OrderIntent[] = [];
  const skip13fSells = cfg.variant === 'new-only';
  if (book.halted) {
    for (const [symbol, p] of Object.entries(book.positions)) orders.push({ symbol, side: 'sell', qty: p.qty, reason: `versie dicht: ${book.haltReason ?? 'verliesgrens'}` });
    return { orders };
  }
  const held = new Set(Object.keys(book.positions));
  for (const s of signals) {
    const p = book.positions[s.symbol];
    if (!p) continue;
    if (!skip13fSells && (s.kind === 'close' || (s.kind === 'reduce' && -s.changePct >= cfg.exitReducePct))) {
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

/** Mandje: allocPct (0–1) per symbool; verdeling over maxGross-budget. */
function planM4Basket(input: { signals: CopySignal[]; barsBySymbol: Record<string, Bar[]>; book: VersionBook; cfg: M4Config }): { orders: OrderIntent[] } {
  const { signals, barsBySymbol, book, cfg } = input;
  const orders: OrderIntent[] = [];
  if (book.halted) {
    for (const [symbol, p] of Object.entries(book.positions)) orders.push({ symbol, side: 'sell', qty: p.qty, reason: `versie dicht: ${book.haltReason ?? 'verliesgrens'}` });
    return { orders };
  }
  const targets = new Map<string, number>();
  for (const s of signals) {
    if (s.kind === 'close') targets.delete(s.symbol);
    else targets.set(s.symbol, s.weightPct / 100);
  }
  const prices: Record<string, number> = {};
  for (const [s, b] of Object.entries(barsBySymbol)) if (b.length) prices[s] = b[b.length - 1]!.c;
  const base = sizingBase(equityOf(book, prices), book, cfg);

  for (const [symbol, p] of Object.entries(book.positions)) {
    if (!targets.has(symbol)) {
      orders.push({ symbol, side: 'sell', qty: p.qty, reason: 'mandje: buiten top holdings' });
    }
  }
  for (const [symbol, alloc] of targets) {
    if (!barsBySymbol[symbol]?.length) continue;
    const px = prices[symbol] ?? 0;
    if (px <= 0) continue;
    const desired = base * cfg.maxGrossPct * alloc;
    const cur = (book.positions[symbol]?.qty ?? 0) * px;
    const delta = desired - cur;
    if (delta > px * 0.5) {
      orders.push({ symbol, side: 'buy', notionalUsd: delta, reason: `mandje: ${(alloc * 100).toFixed(1)}% alloc` });
    } else if (delta < -px * 0.5 && book.positions[symbol]) {
      const sellQty = Math.min(book.positions[symbol]!.qty, Math.ceil(-delta / px));
      if (sellQty > 0) orders.push({ symbol, side: 'sell', qty: sellQty, reason: 'mandje: trim naar alloc' });
    }
  }
  orders.sort((a, b) => (a.side === b.side ? 0 : a.side === 'sell' ? -1 : 1));
  return { orders };
}

export function planM4(input: { signals: CopySignal[]; barsBySymbol: Record<string, Bar[]>; book: VersionBook; cfg: M4Config }): { orders: OrderIntent[] } {
  if (input.cfg.variant === 'basket') return planM4Basket(input);
  return planM4Diff(input);
}

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
