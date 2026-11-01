export type CriterionStatus = 'pass' | 'fail' | 'unknown';
export type NewsLookupStatus = 'ok' | 'empty' | 'failed';

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

function normalizeCriterion(v: unknown): CriterionStatus | undefined {
  if (v === 'pass' || v === 'fail' || v === 'unknown') return v;
  return undefined;
}

/** Deterministic post-check: news unknown + soft-start blocks BUY; RSI from market data wins. */
export function applyPremarketDecisionRules(
  row: { symbol?: string; decision?: string; criteria?: Record<string, unknown> },
  opts: {
    newsUsable: boolean;
    softStartEnabled: boolean;
    rsi?: number | null;
    rsiMin: number;
    rsiMax: number;
  },
): { decision: string; criteria: Record<string, CriterionStatus> } {
  const criteria: Record<string, CriterionStatus> = {};
  for (const [k, v] of Object.entries(row.criteria ?? {})) {
    const norm = normalizeCriterion(v);
    if (norm) criteria[k] = norm;
  }

  if (opts.rsi != null && Number.isFinite(opts.rsi)) {
    criteria.momentum_rsi = momentumRsiPasses(opts.rsi, opts.rsiMin, opts.rsiMax) ? 'pass' : 'fail';
  }

  if (!opts.newsUsable) {
    criteria.no_earnings_risk = 'unknown';
    criteria.news_sentiment = 'unknown';
  }

  let decision = String(row.decision ?? 'NO_GO').toUpperCase();
  if (decision === 'BUY' && opts.softStartEnabled) {
    const newsBlocks =
      !opts.newsUsable ||
      criteria.no_earnings_risk === 'unknown' ||
      criteria.news_sentiment === 'unknown' ||
      criteria.no_earnings_risk === 'fail' ||
      criteria.news_sentiment === 'fail';
    const allPass = Object.values(criteria).length > 0 && Object.values(criteria).every((v) => v === 'pass');
    if (newsBlocks || !allPass) decision = 'NO_GO';
  }

  return { decision, criteria };
}
