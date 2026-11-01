import type { RebalancePlan } from './plan';
import type { StopKind } from './risk';
import type { Bar, OrderIntent, Position, VersionBook, VersionConfig, VetoVerdict } from './types';

/** Optionele strategie-hooks (M4 13F); default blijft M2 ETF-rotatie via planRebalance. */
export interface StrategyHooks<C extends VersionConfig = VersionConfig> {
  stopFor?: (pos: Pick<Position, 'entryPrice' | 'highWater'>, cfg: C) => { level: number; kind: StopKind };
  plan?: (input: { barsBySymbol: Record<string, Bar[]>; book: VersionBook; cfg: C }) => Promise<
    RebalancePlan | { orders: OrderIntent[]; vetoes?: Array<{ symbol: string; verdict: VetoVerdict }> }
  >;
}
