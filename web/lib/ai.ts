import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AsyncLocalStorage } from 'async_hooks';
import {
  AiJsonParseError,
  completeJsonWithRetries,
  jsonMaxTokensFromEnv,
  unwrapJsonArray,
  type JsonCompletion,
} from '@ai/json-response';
import { safeNewsJsonFromText } from '../../src/ai/news-json';

export { AiJsonParseError };

// ============================================================================
// AI-laag — provider-agnostisch. Standaard: Gemini. AGENT_PROVIDER=claude|
// anthropic|deepseek. Modellen per tier via env overrulen.
// ============================================================================

export type Provider = 'gemini' | 'claude' | 'deepseek';
export type Tier = 'fast' | 'smart';
export type ChatMsg = { role: 'user' | 'assistant'; content: string };

type UsageMeta = { input?: number; output?: number; finishReason?: string | null };

const aiRoutineContext = new AsyncLocalStorage<{
  routine?: string;
  decisionId?: string;
  assetClass?: 'etf' | 'crypto';
}>();

export function withAiRoutine<T>(routine: string, fn: () => Promise<T>): Promise<T> {
  const parent = aiRoutineContext.getStore();
  return aiRoutineContext.run({ ...parent, routine }, fn);
}

export function withAiCallContext<T>(
  ctx: { routine?: string; assetClass?: 'etf' | 'crypto' },
  fn: () => Promise<T>,
): Promise<T> {
  const parent = aiRoutineContext.getStore();
  return aiRoutineContext.run({ ...parent, ...ctx }, fn);
}

async function logAiUsage(
  model: string,
  system: string,
  user: string,
  response: string,
  usage?: UsageMeta,
): Promise<void> {
  const ctx = aiRoutineContext.getStore();
  try {
    const { recordAiCall, tokensFromUsage } = await import('./ai-calls');
    const tokens = tokensFromUsage(usage, system, user, response);
    await recordAiCall({
      routine: ctx?.routine,
      provider: activeProvider(),
      model,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      finishReason: usage?.finishReason ?? null,
      decisionId: ctx?.decisionId,
      assetClass:
        ctx?.assetClass ?? (ctx?.routine?.startsWith('crypto') ? 'crypto' : 'etf'),
    });
  } catch {
    /* logging mag routines nooit breken */
  }
}

export function activeProvider(): Provider {
  const p = (process.env.AGENT_PROVIDER ?? 'gemini').toLowerCase();
  if (p === 'claude' || p === 'anthropic') return 'claude';
  if (p === 'deepseek') return 'deepseek';
  return 'gemini';
}

const MODEL_TIERS: Record<Provider, Record<Tier, string>> = {
  gemini: {
    fast: process.env.GEMINI_FAST_MODEL ?? 'gemini-2.5-flash',
    smart: process.env.GEMINI_SMART_MODEL ?? 'gemini-2.5-flash',
  },
  claude: {
    fast: process.env.CLAUDE_FAST_MODEL ?? 'claude-sonnet-4-6',
    smart: process.env.CLAUDE_SMART_MODEL ?? 'claude-opus-4-5',
  },
  deepseek: {
    fast: process.env.DEEPSEEK_FAST_MODEL ?? 'deepseek-flash',
    smart: process.env.DEEPSEEK_SMART_MODEL ?? 'deepseek-flash',
  },
};

const DEEPSEEK_BASE = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com';

let anthropicClient: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY ontbreekt (AGENT_PROVIDER=claude)');
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

const genai = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY ?? '');

export const MODELS = {
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-5',
  flash: 'gemini-2.5-flash',
  pro: 'gemini-2.5-pro-preview-05-06',
} as const;

function tierFromLegacyModel(model: string): Tier {
  return /opus|pro/i.test(model) ? 'smart' : 'fast';
}

function modelForTier(tier: Tier): string {
  return MODEL_TIERS[activeProvider()][tier];
}

function resolveJsonMaxTokens(explicit?: number): number {
  if (explicit != null && explicit > 0) return explicit;
  return jsonMaxTokensFromEnv();
}

// ---- Claude ----------------------------------------------------------------
async function claudeChat(
  model: string,
  system: string,
  messages: ChatMsg[],
  maxTokens: number,
): Promise<JsonCompletion> {
  const resp = await getAnthropic().messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: normalizeAlternating(messages),
  });
  const text = resp.content.filter((b) => b.type === 'text').map((b) => (b.type === 'text' ? b.text : '')).join('');
  const user = messages.map((m) => m.content).join('\n\n');
  const finishReason = resp.stop_reason ?? null;
  await logAiUsage(model, system, user, text, {
    input: resp.usage?.input_tokens,
    output: resp.usage?.output_tokens,
    finishReason,
  });
  return { text, finishReason };
}

function normalizeAlternating(messages: ChatMsg[]): ChatMsg[] {
  const out: ChatMsg[] = [];
  for (const m of messages) {
    if (out.length === 0 && m.role !== 'user') continue;
    const prev = out[out.length - 1];
    if (prev && prev.role === m.role) prev.content += `\n\n${m.content}`;
    else out.push({ role: m.role, content: m.content });
  }
  if (out.length === 0) out.push({ role: 'user', content: messages.map((m) => m.content).join('\n\n') || '...' });
  return out;
}

// ---- Gemini ----------------------------------------------------------------
async function geminiGenerate(
  model: string,
  system: string,
  prompt: string,
  maxTokens: number,
  json = false,
  options?: { disableThinking?: boolean },
): Promise<JsonCompletion> {
  const m = genai.getGenerativeModel({
    model,
    ...(system ? { systemInstruction: system } : {}),
    generationConfig: {
      maxOutputTokens: maxTokens,
      ...(json ? { responseMimeType: 'application/json' } : {}),
      ...(options?.disableThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  });
  const result = await m.generateContent(prompt);
  const text = result.response.text();
  const meta = result.response.usageMetadata;
  const finishReason = result.response.candidates?.[0]?.finishReason ?? null;
  await logAiUsage(model, system, prompt, text, {
    input: meta?.promptTokenCount,
    output: meta?.candidatesTokenCount,
    finishReason,
  });
  return { text, finishReason };
}

// ---- DeepSeek (OpenAI-compatible chat completions) -----------------------
async function deepseekChat(
  model: string,
  system: string,
  user: string,
  maxTokens: number,
  json = false,
): Promise<JsonCompletion> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY ontbreekt (AGENT_PROVIDER=deepseek)');

  const messages: { role: string; content: string }[] = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: user });

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens,
  };
  if (json) {
    body.response_format = { type: 'json_object' };
    body.thinking = { type: 'disabled' };
    body.reasoning_effort = 'none';
  }

  const res = await fetch(`${DEEPSEEK_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`DeepSeek ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string | null }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const choice = data.choices?.[0];
  const text = choice?.message?.content ?? '';
  const finishReason = choice?.finish_reason ?? null;
  await logAiUsage(model, system, user, text, {
    input: data.usage?.prompt_tokens,
    output: data.usage?.completion_tokens,
    finishReason,
  });
  return { text, finishReason };
}

function transcript(messages: ChatMsg[]): string {
  return messages.map((m) => `${m.role === 'user' ? 'Dusty' : 'Momentum'}: ${m.content}`).join('\n\n') + '\n\nMomentum:';
}

async function generateText(system: string, user: string, maxTokens: number, tier: Tier): Promise<string> {
  const provider = activeProvider();
  const model = modelForTier(tier);
  if (provider === 'claude') return (await claudeChat(model, system, [{ role: 'user', content: user }], maxTokens)).text;
  if (provider === 'deepseek') return (await deepseekChat(model, system, user, maxTokens, false)).text;
  return (await geminiGenerate(model, system, user, maxTokens)).text;
}

async function generateJsonCompletion(
  system: string,
  user: string,
  maxTokens: number,
  tier: Tier,
): Promise<JsonCompletion> {
  const provider = activeProvider();
  const model = modelForTier(tier);
  if (provider === 'claude') return claudeChat(model, system, [{ role: 'user', content: user }], maxTokens);
  if (provider === 'deepseek') return deepseekChat(model, system, user, maxTokens, true);
  return geminiGenerate(model, system, user, maxTokens, true);
}

async function generateNewsCompletion(
  system: string,
  user: string,
  maxTokens: number,
): Promise<JsonCompletion> {
  const provider = activeProvider();
  const model = modelForTier('fast');
  if (provider === 'claude') return claudeChat(model, system, [{ role: 'user', content: user }], maxTokens);
  if (provider === 'deepseek') return deepseekChat(model, system, user, maxTokens, true);
  return geminiGenerate(model, system, user, maxTokens, true, { disableThinking: true });
}

export type AgentNewsLookupResult = {
  json: string;
  status: 'ok' | 'empty' | 'failed';
  finishReason: string | null;
  error?: string;
};

/** News pre-call via active provider (DeepSeek/Gemini/Claude), logged to ai_calls. */
export async function agentNewsLookup(
  userPrompt: string,
  options?: { routine?: string; assetClass?: 'etf' | 'crypto'; maxTokens?: number },
): Promise<AgentNewsLookupResult> {
  const routine = options?.routine ?? 'premarket-news';
  const assetClass = options?.assetClass ?? 'etf';
  const maxTokens = options?.maxTokens ?? 2048;
  const system =
    'You are a market analyst. Reply with JSON only (no markdown): an object mapping each symbol to a brief safe/risky note for today.';

  return withAiCallContext({ routine, assetClass }, async () => {
    try {
      const { text, finishReason } = await generateNewsCompletion(system, userPrompt, maxTokens);
      const truncated = finishReason === 'length' || finishReason === 'MAX_TOKENS';
      const json = safeNewsJsonFromText(text, finishReason);
      if (truncated) {
        console.warn('[agentNewsLookup] truncated output', { routine, finishReason, provider: activeProvider() });
      }
      if (json === '{}') {
        const status = truncated ? 'failed' : 'empty';
        console.warn('[agentNewsLookup] no usable news JSON', { routine, status, finishReason });
        return { json: '{}', status, finishReason };
      }
      return { json, status: 'ok', finishReason };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.error('[agentNewsLookup] error', { routine, provider: activeProvider(), error });
      return { json: '{}', status: 'failed', finishReason: null, error };
    }
  });
}

export async function agentText(system: string, user: string, maxTokens = 2048, tier: Tier = 'fast'): Promise<string> {
  return generateText(system, user, maxTokens, tier);
}

export async function agentJsonArray<T>(
  system: string,
  user: string,
  maxTokens?: number,
  tier: Tier = 'fast',
): Promise<T[]> {
  const tokenBudget = resolveJsonMaxTokens(maxTokens);
  const jsonSystem = system.includes('JSON')
    ? system
    : `${system}\n\nAntwoord uitsluitend met geldig JSON (geen markdown of uitleg erbuiten).`;

  const { value } = await completeJsonWithRetries<T[]>(
    (_attempt, tokens) => generateJsonCompletion(jsonSystem, user, tokens, tier),
    {
      maxTokens: tokenBudget,
      maxRetries: 2,
      normalize: (parsed) => unwrapJsonArray(parsed) ?? parsed,
      validate: (parsed) => Array.isArray(parsed),
      onAttempt: (info) => {
        if (info.error) {
          console.warn('[agentJsonArray] retry', {
            provider: activeProvider(),
            attempt: info.attempt,
            finishReason: info.finishReason,
            error: info.error,
          });
        }
      },
    },
  );
  return value;
}

export async function agentJson<T>(
  system: string,
  user: string,
  maxTokens?: number,
  tier: Tier = 'fast',
  validate?: (parsed: unknown) => parsed is T,
): Promise<T> {
  const tokenBudget = resolveJsonMaxTokens(maxTokens);
  const jsonSystem = system.includes('JSON')
    ? system
    : `${system}\n\nAntwoord uitsluitend met geldig JSON (geen markdown of uitleg erbuiten).`;

  const { value } = await completeJsonWithRetries<T>(
    (_attempt, tokens) => generateJsonCompletion(jsonSystem, user, tokens, tier),
    {
      maxTokens: tokenBudget,
      maxRetries: 2,
      validate: validate
        ? (parsed) => validate(parsed)
        : undefined,
      onAttempt: (info) => {
        if (info.error) {
          console.warn('[agentJson] retry', {
            provider: activeProvider(),
            attempt: info.attempt,
            finishReason: info.finishReason,
            error: info.error,
          });
        }
      },
    },
  );
  return value;
}

export async function agentChat(system: string, messages: ChatMsg[], maxTokens = 1024, tier: Tier = 'fast'): Promise<string> {
  const provider = activeProvider();
  const model = modelForTier(tier);
  if (provider === 'claude') return (await claudeChat(model, system, messages, maxTokens)).text;
  const user = transcript(messages);
  if (provider === 'deepseek') return (await deepseekChat(model, system, user, maxTokens, false)).text;
  return (await geminiGenerate(model, system, user, maxTokens)).text;
}

export function claudeJson<T>(model: string, system: string, user: string, maxTokens?: number): Promise<T> {
  return agentJson<T>(system, user, maxTokens, tierFromLegacyModel(model));
}

export function claudeJsonArray<T>(
  model: string,
  system: string,
  user: string,
  maxTokens?: number,
): Promise<T[]> {
  return agentJsonArray<T>(system, user, maxTokens, tierFromLegacyModel(model));
}

export { safeNewsJsonFromText };

export function claudeText(model: string, system: string, user: string, maxTokens = 2048): Promise<string> {
  return agentText(system, user, maxTokens, tierFromLegacyModel(model));
}

/** @deprecated name kept for call sites — uses active AGENT_PROVIDER, not Gemini-only. */
export function geminiText(_model: string, prompt: string, maxTokens = 2048): Promise<string> {
  return agentNewsLookup(prompt, { maxTokens }).then((r) => r.json);
}
