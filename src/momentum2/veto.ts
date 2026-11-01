import { formatNewsContext, sourceLabels } from './news';
import type { VetoCandidate, VetoFn, VetoVerdict } from './types';

export const VETO_SYSTEM_PROMPT =
  'Je bent een risico-controleur voor een papier-handelsstrategie. De strategie heeft al besloten ' +
  'om een ETF te kopen. Jij mag dat alleen tegenhouden (veto), nooit iets toevoegen of verkopen. ' +
  'Veto alleen bij een concrete, aantoonbare reden (bijvoorbeeld een bekend gebeurtenisrisico). ' +
  'Twijfel is geen reden. Baseer je ALLEEN op de aangeleverde koppen en kalender; ontbreken die, dan ken je ' +
  'het nieuws niet en veto je niet. Antwoord uitsluitend met JSON: {"veto": true|false, "reason": "korte zin"}.';

export function buildVetoPrompt(c: VetoCandidate): string {
  return (
    `Kandidaat: ${c.symbol}. Momentum: ${(c.momentum * 100).toFixed(1)}%. ` +
    `Slotkoers ${c.lastClose.toFixed(2)}, 200d gemiddelde ${c.sma.toFixed(2)}. ` +
    `Gewicht in portefeuille ${(c.weight * 100).toFixed(0)}%.\n${formatNewsContext(c.news, c.symbol)}\nLaat je de instap doorgaan?`
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

/** Veto-functie op basis van een tekst-completion (bijv. DeepSeek). Fouten = geen veto, gelogd. Strategieversie en bronnen gaan mee. */
export function makeVeto(
  complete: (system: string, user: string) => Promise<string>,
  meta: { model: string; modelVersion: string },
): VetoFn {
  return async (c) => {
    const trace = { strategyVersion: c.strategy, sources: c.news ? sourceLabels(c.news) : ['geen-nieuws-aangeleverd'] };
    try {
      return { ...parseVetoResponse(await complete(VETO_SYSTEM_PROMPT, buildVetoPrompt(c)), meta), ...trace };
    } catch (e) {
      return { veto: false, reason: `veto-check mislukt: ${String(e).slice(0, 120)}`, failedOpen: true, ...meta, ...trace };
    }
  };
}

/**
 * Laat extra modellen op exact dezelfde input meelopen. Hun uitkomst wordt alleen gelogd (`shadow`);
 * het besluit komt altijd van het hoofdmodel, een fout in een schaduwmodel raakt niets.
 */
export function withShadows(primary: VetoFn, shadows: VetoFn[]): VetoFn {
  return async (c) => {
    const main = await primary(c);
    if (shadows.length === 0) return main;
    const settled = await Promise.all(
      shadows.map((fn) => fn(c).catch((e): VetoVerdict => ({ veto: false, reason: `schaduw mislukt: ${String(e).slice(0, 80)}`, model: 'onbekend', modelVersion: 'onbekend', failedOpen: true }))),
    );
    return { ...main, shadow: settled };
  };
}
