import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AsyncLocalStorage } from 'async_hooks';

// ============================================================================
// AI-laag — provider-agnostisch. Standaard: Gemini. AGENT_PROVIDER=claude|
// anthropic|deepseek. Modellen per tier via env overrulen.
// ============================================================================

export type Provider = 'gemini' | 'claude' | 'deepseek';
export type Tier = 'fast' | 'smart';
export type ChatMsg = { role: 'user' | 'assistant'; content: string };

const aiRoutineContext = new AsyncLocalStorage<{ routine?: string; decisionId?: string }>();

export function withAiRoutine<T>(routine: string, fn: () => Promise<T>): Promise<T> {
  return aiRoutineContext.run({ routine }, fn);
}

async function logAiUsage(
  model: string,
  system: string,
  user: string,
  response: string,
  usage?: { input?: number; output?: number },
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
      decisionId: ctx?.decisionId,
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

// ---- Claude ----------------------------------------------------------------
async function claudeChat(model: string, system: string, messages: ChatMsg[], maxTokens: number): Promise<string> {
  const resp = await getAnthropic().messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: normalizeAlternating(messages),
  });
  const text = resp.content.filter((b) => b.type === 'text').map((b) => (b.type === 'text' ? b.text : '')).join('');
  const user = messages.map((m) => m.content).join('\n\n');
  await logAiUsage(model, system, user, text, {
    input: resp.usage?.input_tokens,
    output: resp.usage?.output_tokens,
  });
  return text;
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
async function geminiGenerate(model: string, system: string, prompt: string, maxTokens: number, json = false): Promise<string> {
  const m = genai.getGenerativeModel({
    model,
    ...(system ? { systemInstruction: system } : {}),
    generationConfig: { maxOutputTokens: maxTokens, ...(json ? { responseMimeType: 'application/json' } : {}) },
  });
  const result = await m.generateContent(prompt);
  const text = result.response.text();
  const meta = result.response.usageMetadata;
  await logAiUsage(model, system, prompt, text, {
    input: meta?.promptTokenCount,
    output: meta?.candidatesTokenCount,
  });
  return text;
}

// ---- DeepSeek (OpenAI-compatible chat completions) -----------------------
async function deepseekChat(
  model: string,
  system: string,
  user: string,
  maxTokens: number,
  json = false,
): Promise<string> {
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
  if (json) body.response_format = { type: 'json_object' };

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
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = data.choices?.[0]?.message?.content ?? '';
  await logAiUsage(model, system, user, text, {
    input: data.usage?.prompt_tokens,
    output: data.usage?.completion_tokens,
  });
  return text;
}

function transcript(messages: ChatMsg[]): string {
  return messages.map((m) => `${m.role === 'user' ? 'Dusty' : 'Momentum'}: ${m.content}`).join('\n\n') + '\n\nMomentum:';
}

async function generateText(system: string, user: string, maxTokens: number, tier: Tier): Promise<string> {
  const provider = activeProvider();
  const model = modelForTier(tier);
  if (provider === 'claude') return claudeChat(model, system, [{ role: 'user', content: user }], maxTokens);
  if (provider === 'deepseek') return deepseekChat(model, system, user, maxTokens, false);
  return geminiGenerate(model, system, user, maxTokens);
}

async function generateJson(system: string, user: string, maxTokens: number, tier: Tier): Promise<string> {
  const provider = activeProvider();
  const model = modelForTier(tier);
  if (provider === 'claude') return claudeChat(model, system, [{ role: 'user', content: user }], maxTokens);
  if (provider === 'deepseek') return deepseekChat(model, system, user, maxTokens, true);
  return geminiGenerate(model, system, user, maxTokens, true);
}

export async function agentText(system: string, user: string, maxTokens = 2048, tier: Tier = 'fast'): Promise<string> {
  return generateText(system, user, maxTokens, tier);
}

export async function agentJson<T>(system: string, user: string, maxTokens = 2048, tier: Tier = 'fast'): Promise<T> {
  const raw = await generateJson(system, user, maxTokens, tier);
  return parseJson<T>(raw);
}

export async function agentChat(system: string, messages: ChatMsg[], maxTokens = 1024, tier: Tier = 'fast'): Promise<string> {
  const provider = activeProvider();
  const model = modelForTier(tier);
  if (provider === 'claude') return claudeChat(model, system, messages, maxTokens);
  const user = transcript(messages);
  if (provider === 'deepseek') return deepseekChat(model, system, user, maxTokens, false);
  return geminiGenerate(model, system, user, maxTokens);
}

function parseJson<T>(text: string): T {
  const match = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  return JSON.parse(match ? match[1] || match[0] : text);
}

export function claudeJson<T>(model: string, system: string, user: string, maxTokens = 2048): Promise<T> {
  return agentJson<T>(system, user, maxTokens, tierFromLegacyModel(model));
}

export function claudeText(model: string, system: string, user: string, maxTokens = 2048): Promise<string> {
  return agentText(system, user, maxTokens, tierFromLegacyModel(model));
}

export function geminiText(model: string, prompt: string): Promise<string> {
  return agentText('', prompt, 1024, tierFromLegacyModel(model));
}
