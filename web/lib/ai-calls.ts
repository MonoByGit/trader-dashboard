import { estimateCostUsd, estimateTokensFromText, loadPriceTable } from '@ai-cost/pricing';
import type { Provider } from './ai';
import { dbRun, hasDb } from './db';
import { ensureSchema } from './migrate';

export async function recordAiCallFailure(input: {
  routine?: string;
  provider: Provider;
  model: string;
  finishReason?: string | null;
  assetClass?: 'etf' | 'crypto';
}): Promise<void> {
  await recordAiCall({
    routine: input.routine,
    provider: input.provider,
    model: input.model,
    inputTokens: 0,
    outputTokens: 0,
    finishReason: input.finishReason ?? 'error',
    assetClass: input.assetClass,
  });
}

export async function recordAiCall(input: {
  routine?: string;
  provider: Provider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  finishReason?: string | null;
  decisionId?: string;
  assetClass?: 'etf' | 'crypto';
}): Promise<void> {
  if (!hasDb()) return;
  await ensureSchema();
  const cost = estimateCostUsd(input.model, input.inputTokens, input.outputTokens, loadPriceTable());
  const id = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const assetClass =
    input.assetClass ?? (input.routine?.startsWith('crypto') ? 'crypto' : 'etf');
  await dbRun(
    `INSERT INTO ai_calls (id, ts, routine, provider, model, input_tokens, output_tokens, finish_reason, cost_usd, decision_id, asset_class)
     VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      input.routine ?? null,
      input.provider,
      input.model,
      input.inputTokens,
      input.outputTokens,
      input.finishReason ?? null,
      cost,
      input.decisionId ?? null,
      assetClass,
    ],
  );
}

export function tokensFromUsage(
  usage: { input?: number; output?: number } | undefined,
  system: string,
  user: string,
  response: string,
): { inputTokens: number; outputTokens: number } {
  if (usage?.input != null && usage?.output != null) {
    return { inputTokens: usage.input, outputTokens: usage.output };
  }
  return {
    inputTokens: estimateTokensFromText(system + user),
    outputTokens: estimateTokensFromText(response),
  };
}

export async function sumAiCostTodayEt(): Promise<number> {
  if (!hasDb()) return 0;
  await ensureSchema();
  const { dbQuery } = await import('./db');
  const rows = await dbQuery<{ total: string }>(
    `SELECT COALESCE(SUM(cost_usd), 0) AS total FROM ai_calls
     WHERE (ts AT TIME ZONE 'America/New_York')::date = (NOW() AT TIME ZONE 'America/New_York')::date`,
  );
  return parseFloat(rows[0]?.total ?? '0');
}
