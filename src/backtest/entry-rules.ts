import type { StrategyRulesLike } from './types';
import type { SymbolSnapshot } from './indicators';

export interface EntryCriteriaResult {
  pass: boolean;
  criteria: Record<string, 'pass' | 'fail' | 'skip'>;
  score: number;
}

export interface EntryRulesContext {
  vixClose?: number | null;
}

/** Deterministic strategy.json entry checks (no LLM / news). */
export function evaluateEntryRules(
  snap: SymbolSnapshot,
  rules: StrategyRulesLike,
  ctx: EntryRulesContext = {},
): EntryCriteriaResult {
  const criteria: Record<string, 'pass' | 'fail' | 'skip'> = {
    trend_above_sma20: snap.aboveSma20 ? 'pass' : 'fail',
    momentum_rsi:
      snap.rsi >= rules.rsi_min && snap.rsi <= rules.rsi_max ? 'pass' : 'fail',
    volume_above_avg: snap.volumeRatio >= rules.volume_ratio_min ? 'pass' : 'fail',
    vix_below_limit: 'skip',
    no_earnings_risk: 'skip',
    news_sentiment: 'skip',
  };

  if (ctx.vixClose != null && Number.isFinite(ctx.vixClose)) {
    criteria.vix_below_limit = ctx.vixClose < rules.vix_threshold ? 'pass' : 'fail';
  }

  const scored = Object.values(criteria).filter((v) => v !== 'skip');
  const passCount = scored.filter((v) => v === 'pass').length;
  const pass = scored.length > 0 && scored.every((v) => v === 'pass');

  return { pass, criteria, score: passCount };
}
