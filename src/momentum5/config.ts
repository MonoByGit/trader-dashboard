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
  /** Close-disaster: % onder hoogste close sinds instap; uitstap volgende open (geen intraday trail). */
  closeDisasterStopPct: number;
}

function parsePctEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n < 1 ? n : fallback;
}

const baseM5 = (riskSymbol: 'QLD' | 'TQQQ', budgetUsd: number, id: string, label: string, closeDisasterStopPct: number): M5Config => ({
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
  trailingStopPct: 0.99,
  closeDisasterStopPct,
  maxLossPct: 0.2,
  floatingBudget: true,
  maxGrossPct: 1,
  driftTolerance: 1,
  vetoEnabled: false,
  bandUpPct: 0.02,
  bandDownPct: 0.02,
  fractional: false,
  feeBps: 0,
});

export type M5VersionOpts = { closeDisasterStopPct?: number; includeTqqq?: boolean };

/** M5 nasdaq-trend (QLD/BIL). TQQQ-variant alleen als env MOMENTUM5_TQQQ=1 (experimenteel). */
export function m5Versions(paperCapitalUsd = PAPER_CAPITAL_USD, opts: M5VersionOpts = {}): M5Config[] {
  const includeTqqq = opts.includeTqqq ?? process.env.MOMENTUM5_TQQQ === '1';
  const disaster =
    opts.closeDisasterStopPct ??
    parsePctEnv('MOMENTUM5_CLOSE_DISASTER_PCT', 0.3);
  const main = baseM5(
    'QLD',
    paperCapitalUsd * M5_BUDGET_PCT,
    'm5-nasdaq-trend',
    'Momentum 5 nasdaq-trend (QLD/BIL)',
    disaster,
  );
  if (!includeTqqq) return [main];
  const tqqq = baseM5(
    'TQQQ',
    paperCapitalUsd * M5_TQQQ_BUDGET_PCT,
    'm5-nasdaq-tqqq',
    'Momentum 5 nasdaq-trend TQQQ (experimenteel, 3%)',
    disaster,
  );
  tqqq.maxLossPct = Math.max(0.35, disaster + 0.05);
  return [main, tqqq];
}
