import { pgDateToYmd } from '../dates/pg.js';
import { sessionBoundsEt, tradingDateEt, type CalendarDay, type RoutineRunRecord } from './decide.js';
import { schedulerStatusFromRun } from './run-status.js';

/**
 * Momentum 2/3/5/6 in schaduw via de scheduler-tick (geen aparte cron, geen open run-route).
 * M4 hoort er bewust niet bij.
 */
export type MomentumStrategy = 'momentum2' | 'momentum3' | 'momentum5' | 'momentum6';
export type MomentumStep = 'decide' | 'execute';

export interface MomentumJob {
  /** Naam in routine_runs, bijv. 'momentum5-execute'. */
  routine: string;
  strategy: MomentumStrategy;
  steps: MomentumStep[];
  /** Sleutel in routine_runs.trading_date: ET-handelsdag (ETF) of UTC-datum (M6, crypto-dagbar). */
  dayKey: string;
}

export const MOMENTUM_ETF: MomentumStrategy[] = ['momentum2', 'momentum3', 'momentum5'];

export const MOMENTUM_TIMING = {
  /** Uitvoeren na de open, als quotes er zijn. */
  executeMinutesAfterOpen: 15,
  /** Niet meer uitvoeren vlak voor de close. */
  executeStopMinutesBeforeClose: 15,
  /** Beslissen na de close, als de dagbar binnen is. */
  decideMinutesAfterClose: 20,
  decideWindowMinutes: 180,
  /** M6: UTC-dagbar is compleet na 00:00 UTC; wacht even op de data. */
  cryptoMinutesAfterUtcMidnight: 30,
  /** Zoveel mislukte of overgeslagen pogingen per dag; daarna pas morgen weer. */
  maxAttemptsPerDay: 6,
};

export const MOMENTUM_ROUTINES = [
  ...MOMENTUM_ETF.flatMap((s) => [`${s}-execute`, `${s}-decide`]),
  'momentum6-run',
];

function isDue(runs: RoutineRunRecord[], routine: string, dayKey: string, nowMs: number): boolean {
  const mine = runs.filter((r) => r.routine === routine && pgDateToYmd(r.trading_date) === dayKey);
  let attempts = 0;
  for (const r of mine) {
    const st = schedulerStatusFromRun(r, nowMs);
    if (st === 'ok') return false;
    if (st === 'running') return false;
    attempts += 1;
  }
  return attempts < MOMENTUM_TIMING.maxAttemptsPerDay;
}

export function decideDueMomentum(input: {
  nowMs: number;
  calendarToday: CalendarDay | null;
  runs: RoutineRunRecord[];
}): MomentumJob[] {
  const { nowMs, calendarToday, runs } = input;
  const t = MOMENTUM_TIMING;
  const jobs: MomentumJob[] = [];

  if (calendarToday && calendarToday.date === tradingDateEt(nowMs)) {
    const { openMs, closeMs } = sessionBoundsEt(calendarToday);
    const day = calendarToday.date;
    const executeOpen = nowMs >= openMs + t.executeMinutesAfterOpen * 60_000 && nowMs < closeMs - t.executeStopMinutesBeforeClose * 60_000;
    const decideOpen =
      nowMs >= closeMs + t.decideMinutesAfterClose * 60_000 &&
      nowMs < closeMs + (t.decideMinutesAfterClose + t.decideWindowMinutes) * 60_000;
    for (const s of MOMENTUM_ETF) {
      if (executeOpen && isDue(runs, `${s}-execute`, day, nowMs)) {
        jobs.push({ routine: `${s}-execute`, strategy: s, steps: ['execute'], dayKey: day });
      }
      if (decideOpen && isDue(runs, `${s}-decide`, day, nowMs)) {
        jobs.push({ routine: `${s}-decide`, strategy: s, steps: ['decide'], dayKey: day });
      }
    }
  }

  const utc = new Date(nowMs);
  const utcDay = utc.toISOString().slice(0, 10);
  const minutesUtc = utc.getUTCHours() * 60 + utc.getUTCMinutes();
  if (minutesUtc >= t.cryptoMinutesAfterUtcMidnight && isDue(runs, 'momentum6-run', utcDay, nowMs)) {
    // crypto handelt 24/7: plan op de afgesloten dagbar en voer direct uit
    jobs.push({ routine: 'momentum6-run', strategy: 'momentum6', steps: ['decide', 'execute'], dayKey: utcDay });
  }
  return jobs;
}
