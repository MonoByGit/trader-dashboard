import type { StrategyRulesPatch } from './content';

/** Heuristic patch from proposal text (testable, no LLM). */
export function inferRulesPatch(title: string, description: string): StrategyRulesPatch {
  const text = `${title} ${description}`.toLowerCase();
  if (text.includes('rsi') && (text.includes('streng') || text.includes('lower') || text.includes('70'))) {
    return { rsi_max: 70 };
  }
  if (text.includes('vix') && (text.includes('streng') || text.includes('lager'))) {
    return { vix_threshold: 25 };
  }
  if (text.includes('volume') && text.includes('hoger')) {
    return { volume_ratio_min: 1.2 };
  }
  return { rsi_max: 72 };
}
