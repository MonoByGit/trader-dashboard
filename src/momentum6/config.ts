import type { VersionConfig } from '../momentum2/types';

export const PAPER_CAPITAL_USD = 100_000;
export const M6_BUDGET_PCT = 0.05;

export interface M6Config extends VersionConfig {
  breakoutDays: number;
  exitLowDays: number;
  maxHoldDays: number;
  trailFromPeakPct: number;
}

export function m6Config(paperCapitalUsd = PAPER_CAPITAL_USD): M6Config {
  return {
    id: 'm6-btc-breakout',
    label: 'Momentum 6 btc-breakout',
    orderTag: 'm6',
    budgetUsd: paperCapitalUsd * M6_BUDGET_PCT,
    universe: ['BTC/USD'],
    topN: 1,
    lookbackDays: 0,
    smaDays: 20,
    volDays: 10,
    rebalanceEveryDays: 1,
    hardStopPct: 0.12,
    trailingStopPct: 0.12,
    maxLossPct: 0.15,
    floatingBudget: false,
    maxGrossPct: 1,
    driftTolerance: 1,
    vetoEnabled: false,
    breakoutDays: 20,
    exitLowDays: 10,
    maxHoldDays: 10,
    trailFromPeakPct: 0.12,
    fractional: true,
    feeBps: 25,
  };
}
