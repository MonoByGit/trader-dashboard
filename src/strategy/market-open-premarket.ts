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

export const MARKET_OPEN_NO_APPROVAL_SKIP_REASON =
  'Premarket keurde vandaag geen symbool goed op alle zes criteria';

/**
 * Welke symbolen de market-open AI mag overwegen: alleen wat premarket vandaag
 * goedkeurde en nog niet open staat. De AI ziet zo de premarket-goedkeuring en
 * stelt geen symbool voor dat de harde poort daarna toch weigert (casus 2-11).
 */
export function marketOpenCandidateUniverse(approved: string[], openSymbols: string[]): string[] {
  const open = new Set(openSymbols);
  return approved.filter((s) => !open.has(s));
}

/** Regel voor de systeemprompt van market-open met de premarket-goedkeuring van vandaag. */
export function marketOpenPremarketPromptLine(universe: string[]): string {
  return ` Premarket keurde vandaag goed op alle zes criteria: ${universe.join(', ')}. Kies ALLEEN uit deze symbolen; elk ander symbool wordt geweigerd.`;
}
