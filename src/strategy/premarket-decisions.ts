export type CriterionStatus = 'pass' | 'fail' | 'unknown';
export type NewsLookupStatus = 'ok' | 'empty' | 'failed';

export const PREMARKET_ENTRY_CRITERIA = [
  'trend_above_sma20',
  'momentum_rsi',
  'volume_above_avg',
  'vix_below_limit',
  'no_earnings_risk',
  'news_sentiment',
] as const;

export type PremarketCriterionKey = (typeof PREMARKET_ENTRY_CRITERIA)[number];

export function newsIsUsable(status: NewsLookupStatus): boolean {
  return status === 'ok';
}

export function newsContextPrompt(status: NewsLookupStatus): string {
  if (status === 'ok') {
    return 'Nieuwslookup: OK. Beoordeel no_earnings_risk en news_sentiment op basis van het nieuws-JSON.';
  }
  if (status === 'failed') {
    return 'Nieuwslookup: MISLUKT. Zet no_earnings_risk en news_sentiment op "unknown" (nooit "pass"). Geen BUY als soft-start actief is.';
  }
  return 'Nieuwslookup: LEEG/onbruikbaar. Zet no_earnings_risk en news_sentiment op "unknown" (nooit "pass"). Geen BUY als soft-start actief is.';
}

export function momentumRsiRuleText(rsiMin: number, rsiMax: number): string {
  return `momentum_rsi: PASS als RSI ≥ ${rsiMin} EN ≤ ${rsiMax} (beide grenzen inclusief). 72.9 → pass, 75.0 → pass, 75.01 → fail, 49.9 → fail.`;
}

export function momentumRsiPasses(rsi: number, rsiMin: number, rsiMax: number): boolean {
  return rsi >= rsiMin && rsi <= rsiMax;
}

/** Normalize LLM criteria values; unknown for anything that is not pass/fail after coercion. */
export function normalizeCriterionValue(v: unknown): CriterionStatus {
  if (v === true) return 'pass';
  if (v === false) return 'fail';
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'pass') return 'pass';
    if (s === 'fail') return 'fail';
    if (s === 'unknown') return 'unknown';
  }
  return 'unknown';
}

export function buildFullPremarketCriteria(
  raw: Record<string, unknown> | undefined,
  opts: { newsUsable: boolean; rsi?: number | null; rsiMin: number; rsiMax: number },
): Record<PremarketCriterionKey, CriterionStatus> {
  const criteria = {} as Record<PremarketCriterionKey, CriterionStatus>;
  for (const key of PREMARKET_ENTRY_CRITERIA) {
    const fromRaw = raw?.[key];
    criteria[key] = fromRaw === undefined ? 'unknown' : normalizeCriterionValue(fromRaw);
  }

  if (opts.rsi != null && Number.isFinite(opts.rsi)) {
    criteria.momentum_rsi = momentumRsiPasses(opts.rsi, opts.rsiMin, opts.rsiMax) ? 'pass' : 'fail';
  }

  if (!opts.newsUsable) {
    criteria.no_earnings_risk = 'unknown';
    criteria.news_sentiment = 'unknown';
  }

  return criteria;
}

export function allPremarketCriteriaPass(criteria: Record<PremarketCriterionKey, CriterionStatus>): boolean {
  return PREMARKET_ENTRY_CRITERIA.every((k) => criteria[k] === 'pass');
}

/** Deterministic post-check: full six criteria; soft-start BUY only if all pass. */
export function applyPremarketDecisionRules(
  row: { symbol?: string; decision?: string; criteria?: Record<string, unknown> },
  opts: {
    newsUsable: boolean;
    softStartEnabled: boolean;
    rsi?: number | null;
    rsiMin: number;
    rsiMax: number;
  },
): { decision: string; criteria: Record<PremarketCriterionKey, CriterionStatus> } {
  const criteria = buildFullPremarketCriteria(row.criteria, opts);

  let decision = String(row.decision ?? 'NO_GO').toUpperCase();
  if (decision === 'BUY' && opts.softStartEnabled && !allPremarketCriteriaPass(criteria)) {
    decision = 'NO_GO';
  }

  return { decision, criteria };
}
