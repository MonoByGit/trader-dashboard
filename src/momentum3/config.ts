import { ROTATION_UNIVERSE } from '../momentum2/config';
import type { VersionConfig } from '../momentum2/types';

/**
 * Momentum 3 'agressief'. Bouwt op het raamwerk van Momentum 2 (boek, stops, verliesgrens, log versus benchmark).
 * Budget: 10% van het paperkapitaal, hooguit de helft in crypto. Alleen papier, alleen schaduw in deze versie.
 */
export interface M3Config extends VersionConfig {
  kind: 'crypto' | 'etf';
  /** RSI(14) onder deze waarde 'bewapent' de instap. */
  rsiTrigger: number;
  /** Aantal dagen terug waarin de RSI onder de trigger moet zijn geweest. */
  armDays: number;
  /** Uitstappen als RSI(14) hierboven komt (mean reversion gedaan). */
  exitRsi: number;
  /** Maximaal aantal dagen vasthouden. */
  maxHoldDays: number;
  /** Trailing stop gaat pas aan als de winst dit percentage bereikt. */
  trailActivatePct: number;
  /** Aandeel van het versiebudget per positie (kleine ETF-posities = 0.25). */
  positionPct: number;
  /** ETF: alleen boven het 200-daags gemiddelde (smaDays); crypto negeert dit. */
  requireTrend: boolean;
}

export const PAPER_CAPITAL_USD = 100_000;
export const M3_BUDGET_PCT = 0.1;
export const M3_MAX_CRYPTO_SHARE = 0.5;

export function m3Versions(paperCapitalUsd = PAPER_CAPITAL_USD): M3Config[] {
  const total = paperCapitalUsd * M3_BUDGET_PCT;
  const crypto = total * M3_MAX_CRYPTO_SHARE; // maximaal de helft
  const etf = total - crypto;
  const common = {
    lookbackDays: 0, volDays: 10, rebalanceEveryDays: 1, maxLossPct: 0.15, floatingBudget: false,
    maxGrossPct: 1, driftTolerance: 1, vetoEnabled: false,
  };
  return [
    {
      ...common, id: 'm3-crypto', label: 'Momentum 3 crypto (RSI-30 mean reversion)', kind: 'crypto',
      budgetUsd: crypto, universe: ['BTC/USD', 'ETH/USD', 'SOL/USD', 'LTC/USD'], topN: 3,
      smaDays: 30, hardStopPct: 0.07, trailingStopPct: 0.05, trailActivatePct: 0.05,
      rsiTrigger: 30, armDays: 3, exitRsi: 55, maxHoldDays: 10, positionPct: 1 / 3,
      requireTrend: false, feeBps: 25, fractional: true,
    },
    {
      ...common, id: 'm3-etf', label: 'Momentum 3 ETF (pullback in uptrend)', kind: 'etf',
      budgetUsd: etf, universe: ROTATION_UNIVERSE, topN: 3,
      smaDays: 200, hardStopPct: 0.04, trailingStopPct: 0.03, trailActivatePct: 0.03,
      rsiTrigger: 40, armDays: 3, exitRsi: 60, maxHoldDays: 15, positionPct: 0.25,
      requireTrend: true, feeBps: 0, fractional: false,
    },
  ];
}
