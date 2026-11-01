import crypto from 'crypto';
import type { StrategyRulesLike } from '../backtest/types';

export type StrategyContent = {
  name: string;
  version: string;
  description?: string;
  symbols: string[];
  rules: StrategyRulesLike & {
    position_size_pct?: number;
    cash_floor_pct?: number;
    trailing_stop_pct?: number;
    breakout_chase_limit_pct?: number;
  };
  entry_criteria?: string[];
  schedule_et?: Record<string, string>;
  agent?: Record<string, unknown>;
};

export type StrategyRulesPatch = Partial<StrategyContent['rules']>;

/** Shallow merge of rules for draft versions from lesson proposals. */
export function mergeStrategyRules(
  base: StrategyContent,
  patch: StrategyRulesPatch,
  versionLabel?: string,
): StrategyContent {
  return {
    ...base,
    version: versionLabel ?? `${base.version}-draft`,
    rules: { ...base.rules, ...patch },
  };
}

export function strategyContentFingerprint(content: StrategyContent): string {
  const payload = JSON.stringify({ rules: content.rules, symbols: content.symbols });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 12);
}
