/**
 * Draaimodus van Momentum 2/3. In deze versie bestaat er GEEN modus waarin orders naar Alpaca gaan:
 * MOMENTUM2_DRY_RUN=0 (of wat dan ook) levert 'geblokkeerd' op, nooit 'echt'.
 * Echte papier-orders komen pas in een aparte PR, na de checklist in docs/momentum-2.md.
 */
export type Momentum2Mode =
  | { run: false; reason: string }
  | { run: true; shadow: true };

export function resolveMomentum2Mode(env: Record<string, string | undefined>): Momentum2Mode {
  if (env.MOMENTUM2_ENABLED !== '1') return { run: false, reason: 'MOMENTUM2_ENABLED staat niet aan' };
  if (env.MOMENTUM2_DRY_RUN === '0') {
    return { run: false, reason: 'echte orders zijn in deze versie geblokkeerd (MOMENTUM2_DRY_RUN=0 wordt geweigerd)' };
  }
  return { run: true, shadow: true };
}

/** Zelfde regel voor andere strategieën (Momentum 3, 4): vlag `<NAAM>_ENABLED=1`, nooit een pad naar echte orders. */
export function resolveShadowMode(env: Record<string, string | undefined>, name: string): Momentum2Mode {
  if (env[`${name}_ENABLED`] !== '1') return { run: false, reason: `${name}_ENABLED staat niet aan` };
  if (env[`${name}_DRY_RUN`] === '0') {
    return { run: false, reason: `echte orders zijn in deze versie geblokkeerd (${name}_DRY_RUN=0 wordt geweigerd)` };
  }
  return { run: true, shadow: true };
}
