import {
  allPremarketCriteriaPass,
  buildFullPremarketCriteria,
  type PremarketCriterionKey,
  type CriterionStatus,
} from './premarket-decisions.js';

export type PremarketDecisionRow = {
  symbol: string;
  decision: string;
  criteria?: Record<string, unknown>;
};

/** Symbols premarket approved for market-open entry (BUY + all six criteria pass). */
export function premarketApprovedBuySymbols(
  rows: PremarketDecisionRow[],
  opts: {
    newsUsable: boolean;
    rsiBySymbol?: Record<string, number | null | undefined>;
    rsiMin: number;
    rsiMax: number;
  },
): string[] {
  const approved: string[] = [];
  for (const row of rows) {
    if (String(row.decision ?? '').toUpperCase() !== 'BUY') continue;
    const rsi = opts.rsiBySymbol?.[row.symbol];
    const criteria = buildFullPremarketCriteria(row.criteria, {
      newsUsable: opts.newsUsable,
      rsi: rsi ?? null,
      rsiMin: opts.rsiMin,
      rsiMax: opts.rsiMax,
    });
    if (allPremarketCriteriaPass(criteria)) {
      approved.push(row.symbol);
    }
  }
  return approved;
}

export function premarketCriteriaForSymbol(
  row: PremarketDecisionRow | undefined,
  opts: {
    newsUsable: boolean;
    rsi?: number | null;
    rsiMin: number;
    rsiMax: number;
  },
): Record<PremarketCriterionKey, CriterionStatus> | null {
  if (!row) return null;
  return buildFullPremarketCriteria(row.criteria, opts);
}

export const MARKET_OPEN_NO_PREMARKET_SKIP_REASON = 'No premarket decisions for today';

export function marketOpenNoPremarketSkip(
  rows: unknown[],
): { skipped: true; reason: string } | null {
  if (rows.length === 0) {
    return { skipped: true, reason: MARKET_OPEN_NO_PREMARKET_SKIP_REASON };
  }
  return null;
}
