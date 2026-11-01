import { ROTATION_UNIVERSE } from '../momentum2/config';
import type { VersionConfig } from '../momentum2/types';

/**
 * Momentum 3 'agressief'. Bouwt op het raamwerk van Momentum 2 (boek, stops, verliesgrens, log versus benchmark).
 * Budget: 10% van het paperkapitaal, hooguit de helft in crypto. Alleen papier, alleen schaduw in deze versie.
 */
export interface M3Config extends VersionConfig {
  kind: 'crypto' | 'etf';
  rsiTrigger: number;
  armDays: number;
  exitRsi: number;
  maxHoldDays: number;
  minHoldDays: number;
  trailActivatePct: number;
  positionPct: number;
  requireTrend: boolean;
  cooldownDays: number;
  trailingAtrDays: number;
  trailingAtrMult: number;
  minDipPct: number;
  minRecentBarCoverage: number;
  minEdgeCostMultiple: number;
}

export const PAPER_CAPITAL_USD = 100_000;
export const M3_BUDGET_PCT = 0.1;
export const M3_MAX_CRYPTO_SHARE = 0.5;

export function m3Versions(paperCapitalUsd = PAPER_CAPITAL_USD): M3Config[] {
  const total = paperCapitalUsd * M3_BUDGET_PCT;
  const crypto = total * M3_MAX_CRYPTO_SHARE;
  const etf = total - crypto;
  const common = {
    lookbackDays: 0,
    volDays: 10,
    rebalanceEveryDays: 2,
    maxLossPct: 0.15,
    floatingBudget: false,
    maxGrossPct: 1,
    driftTolerance: 1,
    vetoEnabled: false,
    minHoldDays: 4,
    trailingAtrDays: 14,
    minDipPct: 0.035,
    minRecentBarCoverage: 0.92,
    minEdgeCostMultiple: 4,
  };
  return [
    {
      ...common,
      id: 'm3-crypto',
      label: 'Momentum 3 crypto (RSI mean reversion)',
      kind: 'crypto',
      budgetUsd: crypto,
      universe: ['BTC/USD', 'ETH/USD', 'SOL/USD', 'LTC/USD'],
      topN: 3,
      smaDays: 30,
      hardStopPct: 0.07,
      trailingStopPct: 0.08,
      trailActivatePct: 0.1,
      trailingAtrMult: 3,
      rsiTrigger: 30,
      armDays: 3,
      exitRsi: 52,
      maxHoldDays: 22,
      positionPct: 1 / 3,
      requireTrend: false,
      cooldownDays: 5,
      feeBps: 25,
      fractional: true,
    },
    {
      ...common,
      id: 'm3-etf',
      label: 'Momentum 3 ETF (pullback in uptrend)',
      kind: 'etf',
      budgetUsd: etf,
      universe: ROTATION_UNIVERSE,
      topN: 3,
      smaDays: 200,
      hardStopPct: 0.04,
      trailingStopPct: 0.03,
      trailActivatePct: 0.05,
      trailingAtrMult: 2,
      rsiTrigger: 40,
      armDays: 3,
      exitRsi: 58,
      maxHoldDays: 22,
      positionPct: 1 / 3,
      requireTrend: true,
      cooldownDays: 3,
      minDipPct: 0.02,
      rebalanceEveryDays: 3,
      feeBps: 0,
      fractional: false,
    },
  ];
}

/** Trailing-activatie moet hoger zijn dan de trailafstand: anders sluit de eerste trail rond break-even. */
export function trailLocksProfit(c: Pick<M3Config, 'trailActivatePct' | 'trailingStopPct'>): boolean {
  return (1 + c.trailActivatePct) * (1 - c.trailingStopPct) > 1;
}

/** Parameterraster voor walk-forward (alleen train): RSI, harde stop, uitstap-RSI, ETF-positiegrootte. */
export function m3Grid(c: M3Config): Array<Partial<M3Config>> {
  const out: Array<Partial<M3Config>> = [];
  const triggers = c.kind === 'crypto' ? [25, 30, 35] : [35, 40, 45];
  const hards = [c.hardStopPct - 0.01, c.hardStopPct, c.hardStopPct + 0.02];
  const exits = c.kind === 'crypto' ? [45, 50, 55] : [50, 55, 60];
  const sizes = c.kind === 'etf' ? [0.25, 1 / 3] : [c.positionPct];
  for (const rsiTrigger of triggers)
    for (const hardStopPct of hards)
      for (const exitRsi of exits)
        for (const positionPct of sizes) {
          const p = { rsiTrigger, hardStopPct, exitRsi, positionPct };
          if (trailLocksProfit({ ...c, ...p })) out.push(p);
        }
  return out;
}
