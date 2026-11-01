/** USD cost per 1M tokens (input / output). Override via env JSON if needed. */

export type ModelPrice = { inputPer1M: number; outputPer1M: number };

const DEFAULT_PRICES: Record<string, ModelPrice> = {
  'claude-sonnet-4-6': { inputPer1M: 3, outputPer1M: 15 },
  'claude-opus-4-5': { inputPer1M: 15, outputPer1M: 75 },
  'gemini-2.5-flash': { inputPer1M: 0.15, outputPer1M: 0.6 },
  'gemini-2.0-flash': { inputPer1M: 0.1, outputPer1M: 0.4 },
  'deepseek-flash': { inputPer1M: 0.14, outputPer1M: 0.28 },
  'deepseek-chat': { inputPer1M: 0.14, outputPer1M: 0.28 },
};

let cachedTable: Record<string, ModelPrice> | null = null;

export function resetPriceTableCache(): void {
  cachedTable = null;
}

export function loadPriceTable(envJson?: string): Record<string, ModelPrice> {
  if (!envJson && cachedTable) return cachedTable;
  const table = { ...DEFAULT_PRICES };
  const raw = envJson ?? process.env.AI_MODEL_PRICES_JSON;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, ModelPrice>;
      for (const [k, v] of Object.entries(parsed)) {
        if (v && typeof v.inputPer1M === 'number' && typeof v.outputPer1M === 'number') {
          table[k] = v;
        }
      }
    } catch {
      /* keep defaults */
    }
  }
  if (!envJson) cachedTable = table;
  return table;
}

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  table: Record<string, ModelPrice> = loadPriceTable(),
): number {
  const price = table[model] ?? table[model.toLowerCase()];
  if (!price) {
    const fallback = { inputPer1M: 1, outputPer1M: 3 };
    return (
      (inputTokens / 1_000_000) * fallback.inputPer1M +
      (outputTokens / 1_000_000) * fallback.outputPer1M
    );
  }
  return (
    (inputTokens / 1_000_000) * price.inputPer1M +
    (outputTokens / 1_000_000) * price.outputPer1M
  );
}

/** Rough token estimate when provider omits usage (chars / 4). */
export function estimateTokensFromText(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
