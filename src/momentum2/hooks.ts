import { planRebalance } from './plan';
import { stopLevel } from './risk';
import type { OrderIntent, Position, VersionBook, VersionConfig, VetoFn, VetoVerdict } from './types';

/** Wat een strategie anders doet dan de basis: stopniveau en dagplan. Boek, risico en logs zijn gedeeld. */
export interface StrategyHooks<C extends VersionConfig = VersionConfig> {
  stopFor(pos: Position, cfg: C): { level: number; kind: string };
  plan(input: {
    barsBySymbol: Record<string, import('./types').Bar[]>;
    book: VersionBook;
    cfg: C;
    veto?: VetoFn;
  }): Promise<{ orders: OrderIntent[]; vetoes: Array<{ symbol: string; verdict: VetoVerdict }> }>;
}

export const rotationHooks: StrategyHooks = {
  stopFor: (pos, cfg) => stopLevel(pos, cfg),
  plan: async (i) => {
    const p = await planRebalance(i);
    return { orders: p.orders, vetoes: p.vetoes };
  },
};
