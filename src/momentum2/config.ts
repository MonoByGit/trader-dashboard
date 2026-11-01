import type { VersionConfig } from './types';

export const ROTATION_UNIVERSE = ['SPY', 'QQQ', 'IWM', 'DIA', 'XLF', 'XLE', 'XLK', 'XLV', 'XLI', 'XLY'];

/** Basisversie van de ETF-rotatie. Andere versies zijn varianten hierop (eigen budget, eigen verliesgrens). */
export const MOMENTUM2_BASE: VersionConfig = {
  id: 'm2-rotatie-a',
  label: 'Momentum 2A (top 3, 126d)',
  budgetUsd: 5000,
  universe: ROTATION_UNIVERSE,
  topN: 3,
  lookbackDays: 126,
  smaDays: 200,
  volDays: 20,
  rebalanceEveryDays: 5,
  hardStopPct: 0.08,
  trailingStopPct: 0.1,
  maxLossPct: 0.15,
  floatingBudget: true,
  maxGrossPct: 1,
  driftTolerance: 0.25,
  vetoEnabled: true,
};

/** Meerdere versies tegelijk op paper. Elk met eigen budget en verliesgrens, allemaal gelogd versus SPY. */
export const DEFAULT_VERSIONS: VersionConfig[] = [
  MOMENTUM2_BASE,
  { ...MOMENTUM2_BASE, id: 'm2-rotatie-b', label: 'Momentum 2B (top 2, 63d)', topN: 2, lookbackDays: 63, budgetUsd: 5000 },
];
