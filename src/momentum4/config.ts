import type { VersionConfig } from '../momentum2/types';

/** Momentum 4 'kopiëren': 5% van het paperkapitaal, verlieslimiet 15%, harde en trailing stop. */
export interface M4Config extends VersionConfig {
  /** Kopieer een toevoeging of opening alleen als het fonds de positie minstens zoveel procent vergroot. */
  minAddPct: number;
  /** Sluit zodra het fonds in één filing minstens zoveel procent verkoopt (close = altijd). */
  exitReducePct: number;
  /** Alleen kopiëren als het gewicht bij het fonds minstens zoveel procent is. */
  minWeightPct: number;
  positionPct: number;
}

export const M4_BUDGET_PCT = 0.05;

export function m4Version(paperCapitalUsd = 100_000, universe: string[] = []): M4Config {
  return {
    id: 'm4-copy',
    label: 'Momentum 4 kopiëren (13F)',
    budgetUsd: paperCapitalUsd * M4_BUDGET_PCT,
    universe,
    topN: 10,
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
  };
}
