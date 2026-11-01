import type { VersionConfig } from '../momentum2/types';
import type { BasketWeightMode } from './basket';

export type M4Variant = 'diff' | 'basket' | 'new-only';

/** Momentum 4 'kopiëren': 5% van het paperkapitaal, verlieslimiet 15%, harde en trailing stop. */
export interface M4Config extends VersionConfig {
  minAddPct: number;
  exitReducePct: number;
  minWeightPct: number;
  positionPct: number;
  /** diff = volg 13F-wijzigingen; basket = top holdings mandje; new-only = alleen opens, geen 13F-exits. */
  variant: M4Variant;
  maxNames: number;
  basketWeight: BasketWeightMode;
}

export const M4_BUDGET_PCT = 0.05;

export function m4Version(
  paperCapitalUsd = 100_000,
  universe: string[] = [],
  overrides: Partial<M4Config> = {},
): M4Config {
  const maxNames = overrides.maxNames ?? 10;
  return {
    id: 'm4-copy',
    label: 'Momentum 4 kopiëren (13F)',
    budgetUsd: paperCapitalUsd * M4_BUDGET_PCT,
    universe,
    topN: maxNames,
    lookbackDays: 0,
    smaDays: 0,
    volDays: 10,
    rebalanceEveryDays: 1,
    hardStopPct: 0.08,
    trailingStopPct: 0.1,
    maxLossPct: 0.15,
    floatingBudget: false,
    maxGrossPct: 1,
    driftTolerance: 1,
    vetoEnabled: false,
    feeBps: 1,
    fractional: false,
    minAddPct: 10,
    exitReducePct: 50,
    minWeightPct: 0.25,
    positionPct: 0.1,
    variant: 'diff',
    maxNames,
    basketWeight: 'conviction',
    ...overrides,
  };
}
