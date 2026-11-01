import type { VersionConfig } from '../momentum2/types';

export const PAPER_CAPITAL_USD = 100_000;
export const M5_BUDGET_PCT = 0.1;
export const M5_TQQQ_BUDGET_PCT = 0.03;

export interface M5Config extends VersionConfig {
  signalSymbol: string;
  riskSymbol: string;
  cashSymbol: string;
  bandUpPct: number;
  bandDownPct: number;
}

const baseM5 = (riskSymbol: 'QLD' | 'TQQQ', budgetUsd: number, id: string, label: string): M5Config => ({
  id,
  label,
  orderTag: 'm5',
  budgetUsd,
  signalSymbol: 'QQQ',
  riskSymbol,
  cashSymbol: 'BIL',
  universe: [riskSymbol, 'BIL', 'QQQ'],
  topN: 1,
  lookbackDays: 0,
  smaDays: 200,
  volDays: 10,
  rebalanceEveryDays: 1,
  hardStopPct: 0.99,
  trailingStopPct: 0.15,
  maxLossPct: 0.2,
  floatingBudget: false,
  maxGrossPct: 1,
  driftTolerance: 1,
  vetoEnabled: false,
  bandUpPct: 0.02,
  bandDownPct: 0.02,
  fractional: false,
  feeBps: 0,
});

/** M5 nasdaq-trend (QLD/BIL). TQQQ-variant alleen als env MOMENTUM5_TQQQ=1. */
export function m5Versions(paperCapitalUsd = PAPER_CAPITAL_USD, includeTqqq = false): M5Config[] {
  const main = baseM5('QLD', paperCapitalUsd * M5_BUDGET_PCT, 'm5-nasdaq-trend', 'Momentum 5 nasdaq-trend (QLD/BIL)');
  if (!includeTqqq) return [main];
  const tqqq = baseM5(
    'TQQQ',
    paperCapitalUsd * M5_TQQQ_BUDGET_PCT,
    'm5-nasdaq-tqqq',
    'Momentum 5 nasdaq-trend TQQQ (optioneel, 3%)',
  );
  return [main, tqqq];
}
