import type { VetoCandidate, VetoFn, VetoVerdict } from './types';

export const VETO_SYSTEM_PROMPT =
  'Je bent een risico-controleur voor een papier-handelsstrategie. De strategie heeft al besloten ' +
  'om een ETF te kopen. Jij mag dat alleen tegenhouden (veto), nooit iets toevoegen of verkopen. ' +
  'Veto alleen bij een concrete, aantoonbare reden (bijvoorbeeld een bekend gebeurtenisrisico). ' +
  'Twijfel is geen reden. Antwoord uitsluitend met JSON: {"veto": true|false, "reason": "korte zin"}.';

export function buildVetoPrompt(c: VetoCandidate): string {
  return (
    `Kandidaat: ${c.symbol}. Momentum: ${(c.momentum * 100).toFixed(1)}%. ` +
    `Slotkoers ${c.lastClose.toFixed(2)}, 200d gemiddelde ${c.sma.toFixed(2)}. ` +
    `Gewicht in portefeuille ${(c.weight * 100).toFixed(0)}%. Laat je de instap doorgaan?`
  );
}

/** Parse het modelantwoord. Onleesbaar = geen veto (de strategie staat), maar gemarkeerd. */
export function parseVetoResponse(raw: string, meta: { model: string; modelVersion: string }): VetoVerdict {
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const j = JSON.parse(m[0]) as { veto?: unknown; reason?: unknown };
      if (typeof j.veto === 'boolean') {
        return { veto: j.veto, reason: String(j.reason ?? '').slice(0, 300), ...meta };
      }
    } catch {
      /* val door naar failedOpen */
    }
  }
  return { veto: false, reason: 'antwoord onleesbaar, geen veto', failedOpen: true, ...meta };
}

/** Veto-functie op basis van een tekst-completion (bijv. DeepSeek). Fouten = geen veto, gelogd. */
export function makeVeto(
  complete: (system: string, user: string) => Promise<string>,
  meta: { model: string; modelVersion: string },
): VetoFn {
  return async (c) => {
    try {
      return parseVetoResponse(await complete(VETO_SYSTEM_PROMPT, buildVetoPrompt(c)), meta);
    } catch (e) {
      return { veto: false, reason: `veto-check mislukt: ${String(e).slice(0, 120)}`, failedOpen: true, ...meta };
    }
  };
}
