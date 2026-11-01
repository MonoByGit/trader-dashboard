import type { VersionConfig } from '../momentum2/types';

export const PAPER_CAPITAL_USD = 100_000;
export const M6_BUDGET_PCT = 0.05;

export interface M6Config extends VersionConfig {
  breakoutDays: number;
  exitLowDays: number;
  maxHoldDays: number;
  trailFromPeakPct: number;
}

function parsePctEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n < 1 ? n : fallback;
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
    hardStopPct: 0.2,
    trailingStopPct: 0.99,
    maxLossPct: parsePctEnv('MOMENTUM6_MAX_LOSS_PCT', 0.15),
    floatingBudget: true,
    maxGrossPct: 1,
    driftTolerance: 1,
    vetoEnabled: false,
    breakoutDays: 20,
    exitLowDays: 10,
    maxHoldDays: 10,
    /** Close-trail in planM6 (exitTrailFromPeakClose); geen intraday trail. */
    trailFromPeakPct: 0.12,
    fractional: true,
    feeBps: 25,
  };
}
