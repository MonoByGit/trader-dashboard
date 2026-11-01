/**
 * Schaduwtick voor Momentum 2, 3, 5 en 6 (geen M4). Pure beslislogica: welke stap is nu aan de beurt?
 * Aangeroepen vanuit de scheduler-tick (elke 5 minuten); dubbel draaien voorkomt de aanroeper met een
 * 'gedaan'-markering per (strategie, stap, dag).
 */
import { sessionBoundsEt, tradingDateEt, type CalendarDay } from '../scheduler/decide.js';

export type MomentumName = 'momentum2' | 'momentum3' | 'momentum5' | 'momentum6';
export type MomentumStep = 'decide' | 'execute';
export interface MomentumDue {
  name: MomentumName;
  step: MomentumStep;
  /** Dagsleutel voor de gedaan-markering (ET-handelsdag voor aandelen, UTC-dag voor crypto). */
  dayKey: string;
}

const MIN = 60_000;
export const STOCK_NAMES: MomentumName[] = ['momentum2', 'momentum3', 'momentum5'];

export const EXECUTE_AFTER_OPEN_MIN = 10;
export const EXECUTE_WINDOW_MIN = 80;
export const DECIDE_AFTER_CLOSE_MIN = 10;
export const DECIDE_WINDOW_MIN = 170;
/** M6 (crypto): na de UTC-daggrens, zodra de dagbar van gisteren er is. */
export const CRYPTO_AFTER_UTC_MIN = 15;
export const CRYPTO_WINDOW_MIN = 300;

export function momentumDoneKey(d: MomentumDue): string {
  return `m:tick:${d.name}:${d.step}:${d.dayKey}`;
}

export function decideMomentumTick(input: {
  nowMs: number;
  calendarToday: CalendarDay | null;
  done: ReadonlySet<string>;
}): MomentumDue[] {
  const { nowMs, calendarToday, done } = input;
  const out: MomentumDue[] = [];
  const push = (d: MomentumDue) => {
    if (!done.has(momentumDoneKey(d))) out.push(d);
  };

  if (calendarToday) {
    const { openMs, closeMs } = sessionBoundsEt(calendarToday);
    const dayKey = calendarToday.date;
    if (dayKey === tradingDateEt(nowMs)) {
      const execFrom = openMs + EXECUTE_AFTER_OPEN_MIN * MIN;
      if (nowMs >= execFrom && nowMs < execFrom + EXECUTE_WINDOW_MIN * MIN) {
        for (const name of STOCK_NAMES) push({ name, step: 'execute', dayKey });
      }
      const decFrom = closeMs + DECIDE_AFTER_CLOSE_MIN * MIN;
      if (nowMs >= decFrom && nowMs < decFrom + DECIDE_WINDOW_MIN * MIN) {
        for (const name of STOCK_NAMES) push({ name, step: 'decide', dayKey });
      }
    }
  }

  const d = new Date(nowMs);
  const utcMidnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const cryptoFrom = utcMidnight + CRYPTO_AFTER_UTC_MIN * MIN;
  if (nowMs >= cryptoFrom && nowMs < cryptoFrom + CRYPTO_WINDOW_MIN * MIN) {
    const dayKey = new Date(utcMidnight).toISOString().slice(0, 10);
    push({ name: 'momentum6', step: 'decide', dayKey });
    push({ name: 'momentum6', step: 'execute', dayKey });
  }
  return out;
}

/** Een run telt als 'gedaan' tenzij hij zichzelf oversloeg (markt dicht, bar nog niet binnen, vlag uit). */
export function isDoneResult(result: Record<string, unknown>): boolean {
  return result.skipped !== true;
}
