export class AiJsonParseError extends Error {
  readonly attempts: number;
  readonly lastFinishReason: string | null | undefined;

  constructor(message: string, attempts: number, lastFinishReason?: string | null) {
    super(message);
    this.name = 'AiJsonParseError';
    this.attempts = attempts;
    this.lastFinishReason = lastFinishReason;
  }
}

export type JsonCompletion = {
  text: string;
  finishReason: string | null;
};

export type JsonRetryOptions = {
  maxTokens: number;
  maxRetries?: number;
  validate?: (parsed: unknown) => boolean;
  /** Runs after JSON.parse, before validate (e.g. unwrap {"decisions":[...]}). */
  normalize?: (parsed: unknown) => unknown;
  onAttempt?: (info: {
    attempt: number;
    finishReason: string | null;
    error?: string;
  }) => void;
};

export const JSON_ARRAY_WRAPPER_KEYS = ['decisions', 'candidates'] as const;

/** DeepSeek json_object returns an object; unwrap list fields for for...of routines. */
export function unwrapJsonArray(
  parsed: unknown,
  preferKeys: readonly string[] = JSON_ARRAY_WRAPPER_KEYS,
): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    for (const key of preferKeys) {
      const v = obj[key];
      if (Array.isArray(v)) return v;
    }
    for (const v of Object.values(obj)) {
      if (Array.isArray(v)) return v;
    }
  }
  return null;
}

export function isJsonArrayPayload(parsed: unknown): parsed is unknown[] {
  return unwrapJsonArray(parsed) !== null;
}

const DEFAULT_JSON_MAX_TOKENS = 4096;
const MAX_DEEPSEEK_TOKENS = 393216;

/** Configurable ceiling for JSON-mode completions (env AI_JSON_MAX_TOKENS, default 4096). */
export function jsonMaxTokensFromEnv(): number {
  const raw = process.env.AI_JSON_MAX_TOKENS;
  if (raw == null || raw === '') return DEFAULT_JSON_MAX_TOKENS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_JSON_MAX_TOKENS;
  return Math.min(n, MAX_DEEPSEEK_TOKENS);
}

export function extractJsonPayload(text: string): string {
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const bare = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (bare) return (bare[1] ?? bare[0]).trim();
  return text.trim();
}

export function parseJsonPayload(text: string): unknown {
  const payload = extractJsonPayload(text);
  return JSON.parse(payload);
}

export function defaultJsonRootValidate(parsed: unknown): boolean {
  return parsed !== null && typeof parsed === 'object';
}

export function shouldRetryJson(
  finishReason: string | null,
  parseError: boolean,
  validationFailed: boolean,
): boolean {
  if (finishReason === 'length') return true;
  if (parseError) return true;
  if (validationFailed) return true;
  return false;
}

/**
 * Calls the provider up to maxRetries+1 times when output is truncated or JSON is invalid.
 */
export async function completeJsonWithRetries<T>(
  call: (attempt: number, maxTokens: number) => Promise<JsonCompletion>,
  options: JsonRetryOptions,
): Promise<{ value: T; attempts: number; finishReason: string | null }> {
  const maxRetries = options.maxRetries ?? 2;
  const validate = options.validate ?? defaultJsonRootValidate;
  let lastFinish: string | null = null;
  let lastError = 'unknown';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const tokenBudget =
      attempt === 0
        ? options.maxTokens
        : Math.min(Math.floor(options.maxTokens * (1 + attempt * 0.5)), MAX_DEEPSEEK_TOKENS);

    const { text, finishReason } = await call(attempt, tokenBudget);
    lastFinish = finishReason;

    let parsed: unknown;
    let parseFailed = false;
    try {
      parsed = parseJsonPayload(text);
    } catch (e) {
      parseFailed = true;
      lastError = e instanceof Error ? e.message : String(e);
      options.onAttempt?.({ attempt: attempt + 1, finishReason, error: lastError });
      if (attempt < maxRetries && shouldRetryJson(finishReason, true, false)) continue;
      throw new AiJsonParseError(
        `AI JSON parse failed after ${attempt + 1} attempt(s): ${lastError}`,
        attempt + 1,
        finishReason,
      );
    }

    const normalized = options.normalize ? options.normalize(parsed) : parsed;

    const validationFailed = !validate(normalized);
    if (validationFailed) {
      lastError = 'JSON schema/root validation failed';
      options.onAttempt?.({ attempt: attempt + 1, finishReason, error: lastError });
      if (attempt < maxRetries && shouldRetryJson(finishReason, false, true)) continue;
      throw new AiJsonParseError(
        `AI JSON validation failed after ${attempt + 1} attempt(s)`,
        attempt + 1,
        finishReason,
      );
    }

    options.onAttempt?.({ attempt: attempt + 1, finishReason });
    return { value: normalized as T, attempts: attempt + 1, finishReason };
  }

  throw new AiJsonParseError(
    `AI JSON failed after ${maxRetries + 1} attempt(s): ${lastError}`,
    maxRetries + 1,
    lastFinish,
  );
}
