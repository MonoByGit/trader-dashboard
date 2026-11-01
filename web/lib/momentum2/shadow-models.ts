import { makeVeto } from '../../../src/momentum2/veto';
import type { VetoFn } from '../../../src/momentum2/types';

/**
 * Schaduwmodellen voor de veto-check: alleen modellen waarvoor al een sleutel bestaat, en alleen als
 * MOMENTUM_SHADOW_MODELS ze noemt (bijv. "claude,gemini"). Hun uitkomst wordt gelogd, nooit gebruikt.
 * Vaste hosts: een sleutel gaat nooit naar een via env opgegeven andere server.
 */
function claudeShadow(): VetoFn | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const model = process.env.SHADOW_CLAUDE_MODEL ?? 'claude-sonnet-4-6';
  return async (c) => {
    let served = model;
    const fn = makeVeto(async (system, user) => {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: 200, temperature: 0, system, messages: [{ role: 'user', content: user }] }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`Anthropic ${res.status}`);
      const d = (await res.json()) as { model?: string; content?: Array<{ text?: string }> };
      served = d.model ?? model;
      return d.content?.[0]?.text ?? '';
    }, { model, modelVersion: 'pending' });
    const v = await fn(c);
    return { ...v, model: served, modelVersion: served };
  };
}

function geminiShadow(): VetoFn | null {
  const key = process.env.GOOGLE_AI_API_KEY;
  if (!key) return null;
  const model = process.env.SHADOW_GEMINI_MODEL ?? 'gemini-2.5-flash';
  return makeVeto(async (system, user) => {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 200 },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const d = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    return d.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }, { model, modelVersion: model });
}

export function shadowVetoes(env = process.env): VetoFn[] {
  const wanted = (env.MOMENTUM_SHADOW_MODELS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const out: VetoFn[] = [];
  if (wanted.includes('claude')) { const f = claudeShadow(); if (f) out.push(f); }
  if (wanted.includes('gemini')) { const f = geminiShadow(); if (f) out.push(f); }
  return out;
}
