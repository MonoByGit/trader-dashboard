import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ============================================================================
// AI-laag — provider-agnostisch. Het "brein" van Momentum is configureerbaar.
// Standaard draait alles op Google Gemini. Zet AGENT_PROVIDER=claude (of
// 'anthropic') om zonder codewijziging naar Claude te schakelen. Modellen per
// tier zijn los te overrulen via env, zodat upgraden geen deploy van code vergt.
// ============================================================================

export type Provider = 'gemini' | 'claude';
export type Tier = 'fast' | 'smart';
export type ChatMsg = { role: 'user' | 'assistant'; content: string };

export function activeProvider(): Provider {
  const p = (process.env.AGENT_PROVIDER ?? 'gemini').toLowerCase();
  return p === 'claude' || p === 'anthropic' ? 'claude' : 'gemini';
}

const MODEL_TIERS: Record<Provider, Record<Tier, string>> = {
  gemini: {
    fast: process.env.GEMINI_FAST_MODEL ?? 'gemini-2.0-flash',
    smart: process.env.GEMINI_SMART_MODEL ?? 'gemini-2.0-flash',
  },
  claude: {
    fast: process.env.CLAUDE_FAST_MODEL ?? 'claude-sonnet-4-6',
    smart: process.env.CLAUDE_SMART_MODEL ?? 'claude-opus-4-5',
  },
};

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genai = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY ?? '');

// Behouden voor backward-compat: bestaande callsites geven nog een model-string
// mee. Daaruit leiden we de tier af; de ACTIEVE provider bepaalt welk model echt
// draait (dus 'MODELS.sonnet' betekent simpelweg "snelle tier").
export const MODELS = {
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-5',
  flash: 'gemini-2.0-flash',
  pro: 'gemini-2.5-pro-preview-05-06',
} as const;

function tierFromLegacyModel(model: string): Tier {
  return /opus|pro/i.test(model) ? 'smart' : 'fast';
}

// ---- Claude ----------------------------------------------------------------
async function claudeChat(model: string, system: string, messages: ChatMsg[], maxTokens: number): Promise<string> {
  const resp = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: normalizeAlternating(messages),
  });
  return resp.content.filter((b) => b.type === 'text').map((b) => (b.type === 'text' ? b.text : '')).join('');
}

// Claude vereist dat de conversatie met 'user' begint en rollen alterneren.
// We droppen leidende assistant-berichten en voegen opeenvolgende gelijke rollen samen.
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
  return result.response.text();
}

// Multi-turn naar een enkele transcript-prompt; provider-onafhankelijk robuust
// (geen strikte alternatie-eisen, werkt ook voor agent-geïnitieerde draden).
function transcript(messages: ChatMsg[]): string {
  return messages.map((m) => `${m.role === 'user' ? 'Dusty' : 'Momentum'}: ${m.content}`).join('\n\n') + '\n\nMomentum:';
}

// ---- Provider-agnostische API (gebruik dit voor nieuw werk) ----------------
export async function agentText(system: string, user: string, maxTokens = 2048, tier: Tier = 'fast'): Promise<string> {
  if (activeProvider() === 'claude') return claudeChat(MODEL_TIERS.claude[tier], system, [{ role: 'user', content: user }], maxTokens);
  return geminiGenerate(MODEL_TIERS.gemini[tier], system, user, maxTokens);
}

export async function agentJson<T>(system: string, user: string, maxTokens = 2048, tier: Tier = 'fast'): Promise<T> {
  const raw = activeProvider() === 'claude'
    ? await claudeChat(MODEL_TIERS.claude[tier], system, [{ role: 'user', content: user }], maxTokens)
    : await geminiGenerate(MODEL_TIERS.gemini[tier], system, user, maxTokens, true);
  return parseJson<T>(raw);
}

export async function agentChat(system: string, messages: ChatMsg[], maxTokens = 1024, tier: Tier = 'fast'): Promise<string> {
  if (activeProvider() === 'claude') return claudeChat(MODEL_TIERS.claude[tier], system, messages, maxTokens);
  return geminiGenerate(MODEL_TIERS.gemini[tier], system, transcript(messages), maxTokens);
}

function parseJson<T>(text: string): T {
  const match = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  return JSON.parse(match ? match[1] || match[0] : text);
}

// ---- Backward-compat wrappers (model-arg => tier; actieve provider beslist) -
export function claudeJson<T>(model: string, system: string, user: string, maxTokens = 2048): Promise<T> {
  return agentJson<T>(system, user, maxTokens, tierFromLegacyModel(model));
}

export function claudeText(model: string, system: string, user: string, maxTokens = 2048): Promise<string> {
  return agentText(system, user, maxTokens, tierFromLegacyModel(model));
}

export function geminiText(model: string, prompt: string): Promise<string> {
  return agentText('', prompt, 1024, tierFromLegacyModel(model));
}
