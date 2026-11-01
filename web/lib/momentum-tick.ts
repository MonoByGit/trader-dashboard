import { resolveShadowMode } from '../../src/momentum2/mode';
import {
  decideMomentumTick,
  isDoneResult,
  momentumDoneKey,
  type MomentumDue,
  type MomentumName,
} from '../../src/momentum2/tick';
import type { CalendarDay } from '@scheduler/decide';

type Runners = Record<MomentumName, (step: 'decide' | 'execute', nowMs: number) => Promise<Record<string, unknown>>>;

// Lazy: zware imports (Alpaca, pg) pas laden als er echt iets gedraaid wordt; houdt de unit-test licht.
const RUNNERS: Runners = {
  momentum2: async (s, n) => (await import('./momentum2/run')).runMomentum2(s, n),
  momentum3: async (s, n) => (await import('./momentum3/run')).runMomentum3(s, n),
  momentum5: async (s, n) => (await import('./momentum5/run')).runMomentum5(s, n),
  momentum6: async (s, n) => (await import('./momentum6/run')).runMomentum6(s, n),
};

const FLAG: Record<MomentumName, string> = {
  momentum2: 'MOMENTUM2',
  momentum3: 'MOMENTUM3',
  momentum5: 'MOMENTUM5',
  momentum6: 'MOMENTUM6',
};

async function readDone(keys: string[]): Promise<Set<string>> {
  const { dbQuery, hasDb } = await import('./db');
  if (!keys.length || !hasDb()) return new Set();
  const rows = await dbQuery<{ key: string }>(`SELECT key FROM settings WHERE key = ANY($1)`, [keys]);
  return new Set(rows.map((r) => r.key));
}

async function putSetting(key: string, value: unknown): Promise<void> {
  const { dbRun } = await import('./db');
  await dbRun(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, JSON.stringify(value)],
  );
}

export interface MomentumTickDeps {
  run?: typeof RUNNERS;
  readDone?: typeof readDone;
  markDone?: (key: string, value: unknown) => Promise<void>;
  log?: (line: string) => void;
  env?: NodeJS.ProcessEnv;
}

/**
 * Draait de schaduwstappen die nu aan de beurt zijn, alleen voor strategieën met <NAAM>_ENABLED=1.
 * Elke run is alleen schaduw (zie resolveShadowMode); fouten breken de rest van de scheduler-tick niet.
 */
export async function runMomentumShadowTick(
  nowMs: number,
  calendarToday: CalendarDay | null,
  deps: MomentumTickDeps = {},
): Promise<Record<string, unknown>> {
  const run = deps.run ?? RUNNERS;
  const log = deps.log ?? ((l: string) => console.log(l));
  const env = deps.env ?? process.env;
  const markDone = deps.markDone ?? putSetting;

  const candidates = decideMomentumTick({ nowMs, calendarToday, done: new Set() });
  const doneSet = await (deps.readDone ?? readDone)(candidates.map(momentumDoneKey));
  const due: MomentumDue[] = decideMomentumTick({ nowMs, calendarToday, done: doneSet }).filter(
    (d) => resolveShadowMode(env, FLAG[d.name]).run,
  );

  const results: Record<string, unknown> = {};
  for (const d of due) {
    const id = `${d.name}:${d.step}`;
    try {
      const r = await run[d.name](d.step, nowMs);
      results[id] = r;
      if (isDoneResult(r)) {
        await markDone(momentumDoneKey(d), { at: new Date(nowMs).toISOString() });
        log(`[momentum-shadow-tick] ${id} dag=${d.dayKey} schaduw=ja uitkomst=${JSON.stringify(r).slice(0, 400)}`);
      } else {
        log(`[momentum-shadow-tick] ${id} dag=${d.dayKey} overgeslagen: ${String(r.reason ?? '')}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results[id] = { error: msg };
      // Niet opnieuw proberen binnen dezelfde dag: een half uitgevoerde schaduwstap mag niet dubbel boeken.
      try {
        await markDone(momentumDoneKey(d), { at: new Date(nowMs).toISOString(), error: msg });
      } catch { /* markering mislukt: volgende tick probeert opnieuw */ }
      console.error(`[momentum-shadow-tick] ${id} dag=${d.dayKey} FOUT: ${msg}`);
    }
  }
  if (due.length) {
    try {
      await putSetting('scheduler_last_tick', {
        at: new Date(nowMs).toISOString(),
        momentum: Object.keys(results),
      });
    } catch { /* alleen weergave */ }
  }
  return results;
}
