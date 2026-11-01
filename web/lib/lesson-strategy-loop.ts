import { inferRulesPatch } from '../../src/strategy/lesson-patch';
import type { StrategyRulesPatch } from '../../src/strategy/content';
import { createDraftStrategyVersion } from '@/lib/strategy-versions';
import { startStrategyComparison } from '@/lib/strategy-comparison';
import { dbRun } from '@/lib/db';

export { inferRulesPatch };

function defaultComparisonPeriod(): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 1);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

/** Lesson proposal → draft strategy + backtest vs active (never auto-activate). */
export async function attachStrategyBacktestToProposal(input: {
  proposalId: string;
  title: string;
  description: string;
  rulesPatch?: StrategyRulesPatch;
}): Promise<{ draftId: string; comparisonId: string } | null> {
  try {
    const draft = await createDraftStrategyVersion({
      rulesPatch: input.rulesPatch ?? inferRulesPatch(input.title, input.description),
      notes: `Lesvoorstel: ${input.title}`,
      versionLabel: `lesson-${Date.now().toString(36)}`,
    });
    const period = defaultComparisonPeriod();
    const comparison = await startStrategyComparison({
      draftId: draft.id,
      periodStart: period.start,
      periodEnd: period.end,
    });
    await dbRun(
      `UPDATE lesson_proposals SET strategy_draft_id = $2, comparison_id = $3, rules_patch = $4::jsonb WHERE id = $1`,
      [
        input.proposalId,
        draft.id,
        comparison.id,
        JSON.stringify(input.rulesPatch ?? inferRulesPatch(input.title, input.description)),
      ],
    );
    return { draftId: draft.id, comparisonId: comparison.id };
  } catch (e) {
    console.error('[lesson-strategy-loop]', e);
    return null;
  }
}
