import { makeVeto } from '../../../src/momentum2/veto';
import type { VetoFn } from '../../../src/momentum2/types';

// Vaste host: de sleutel gaat nooit naar een via env opgegeven andere server.
const BASE = 'https://api.deepseek.com';

/**
 * DeepSeek als veto-poort. Het model dat het antwoord gaf (uit de API-respons) gaat mee in de
 * besluitenlog. Zonder sleutel of bij een fout: geen veto, wel gelogd als failedOpen.
 */
export function deepseekVeto(): VetoFn {
  const requested = process.env.DEEPSEEK_VETO_MODEL ?? 'deepseek-chat';
  return async (c) => {
    let served = requested;
    let fingerprint = 'onbekend';
    const fn = makeVeto(
      async (system, user) => {
        const key = process.env.DEEPSEEK_API_KEY;
        if (!key) throw new Error('DEEPSEEK_API_KEY ontbreekt');
        const res = await fetch(`${BASE}/v1/chat/completions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: requested,
            messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
            max_tokens: 200,
            temperature: 0,
            response_format: { type: 'json_object' },
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new Error(`DeepSeek ${res.status}`);
        const data = (await res.json()) as { model?: string; system_fingerprint?: string; choices?: { message?: { content?: string } }[] };
        served = data.model ?? requested;
        fingerprint = data.system_fingerprint ?? 'onbekend';
        return data.choices?.[0]?.message?.content ?? '';
      },
      { model: requested, modelVersion: 'pending' },
    );
    const verdict = await fn(c);
    return { ...verdict, model: served, modelVersion: fingerprint };
  };
}
