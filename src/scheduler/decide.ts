export type RoutineName = 'premarket' | 'market-open' | 'midday' | 'eod' | 'weekly';

export interface CalendarDay {
  date: string;
  open: string;
  close: string;
}

export interface RoutineRunRecord {
  routine: string;
  trading_date: string;
  status: string;
  finished_at?: string | null;
}

export interface SchedulerConfig {
  tickGraceMinutes: number;
  premarketMinutesBeforeOpen: number;
  marketOpenMinutesAfterOpen: number;
  middayEtHour: number;
  middayEtMinute: number;
  eodMinutesBeforeClose: number;
  weeklyMinutesAfterClose: number;
  retryWindowMinutes: number;
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  tickGraceMinutes: 5,
  premarketMinutesBeforeOpen: 30,
  marketOpenMinutesAfterOpen: 5,
  middayEtHour: 13,
  middayEtMinute: 30,
  eodMinutesBeforeClose: 10,
  weeklyMinutesAfterClose: 25,
  retryWindowMinutes: 45,
};

/** Parse Alpaca calendar open/close (HH:MM) on a calendar date in America/New_York. */
export function sessionBoundsEt(day: CalendarDay): { openMs: number; closeMs: number } {
  const openMs = etWallToUtcMs(day.date, day.open);
  const closeMs = etWallToUtcMs(day.date, day.close);
  return { openMs, closeMs };
}

function etWallToUtcMs(dateYmd: string, hhmm: string): number {
  const [y, m, d] = dateYmd.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh + 5, mm, 0);
  for (let offset = 4; offset <= 5; offset++) {
    const utc = Date.UTC(y, m - 1, d, hh + offset, mm, 0);
    const label = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(utc));
    const norm = label.replace(/^24:/, '00:');
    const want = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    if (norm === want) return utc;
  }
  return guess;
}

export function tradingDateEt(nowMs: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(nowMs));
}

function etParts(nowMs: number): { hour: number; minute: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(nowMs));
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { hour, minute, weekday: map[wd] ?? 1 };
}

function inWindow(nowMs: number, targetMs: number, graceMin: number): boolean {
  const grace = graceMin * 60_000;
  return nowMs >= targetMs - grace && nowMs < targetMs + grace;
}

function lastRunFor(
  runs: RoutineRunRecord[],
  routine: RoutineName,
  tradingDate: string,
): RoutineRunRecord | undefined {
  return runs
    .filter((r) => r.routine === routine && r.trading_date === tradingDate)
    .sort((a, b) => (b.finished_at ?? '').localeCompare(a.finished_at ?? ''))[0];
}

function shouldRunRoutine(
  routine: RoutineName,
  runs: RoutineRunRecord[],
  tradingDate: string,
  cfg: SchedulerConfig,
  nowMs: number,
): boolean {
  const last = lastRunFor(runs, routine, tradingDate);
  if (last?.status === 'ok') return false;
  if (last?.status === 'skipped') return false;
  if (last?.status === 'failed' && last.finished_at) {
    const finishedMs = new Date(last.finished_at).getTime();
    if (nowMs - finishedMs > cfg.retryWindowMinutes * 60_000) return false;
    return true;
  }
  return true;
}

export interface DecideInput {
  nowMs: number;
  calendarToday: CalendarDay | null;
  calendarThisWeek: CalendarDay[];
  runs: RoutineRunRecord[];
  config?: Partial<SchedulerConfig>;
}

export function decideDueRoutines(input: DecideInput): RoutineName[] {
  const cfg = { ...DEFAULT_SCHEDULER_CONFIG, ...input.config };
  const { nowMs, calendarToday, calendarThisWeek, runs } = input;
  const tradingDate = tradingDateEt(nowMs);
  const due: RoutineName[] = [];

  if (!calendarToday) {
    return due;
  }

  const { openMs, closeMs } = sessionBoundsEt(calendarToday);
  const grace = cfg.tickGraceMinutes;

  const premarketTarget = openMs - cfg.premarketMinutesBeforeOpen * 60_000;
  if (
    inWindow(nowMs, premarketTarget, grace) &&
    shouldRunRoutine('premarket', runs, tradingDate, cfg, nowMs)
  ) {
    due.push('premarket');
  }

  const marketOpenTarget = openMs + cfg.marketOpenMinutesAfterOpen * 60_000;
  if (
    inWindow(nowMs, marketOpenTarget, grace) &&
    shouldRunRoutine('market-open', runs, tradingDate, cfg, nowMs)
  ) {
    due.push('market-open');
  }

  const { hour, minute } = etParts(nowMs);
  const middayTargetMin = cfg.middayEtHour * 60 + cfg.middayEtMinute;
  const nowMin = hour * 60 + minute;
  if (
    nowMin >= middayTargetMin - grace &&
    nowMin < middayTargetMin + grace &&
    shouldRunRoutine('midday', runs, tradingDate, cfg, nowMs)
  ) {
    due.push('midday');
  }

  const eodTarget = closeMs - cfg.eodMinutesBeforeClose * 60_000;
  if (
    inWindow(nowMs, eodTarget, grace) &&
    shouldRunRoutine('eod', runs, tradingDate, cfg, nowMs)
  ) {
    due.push('eod');
  }

  const sortedWeek = [...calendarThisWeek].sort((a, b) => a.date.localeCompare(b.date));
  const lastSession = sortedWeek[sortedWeek.length - 1];
  if (lastSession && lastSession.date === calendarToday.date) {
    const weeklyTarget = closeMs + cfg.weeklyMinutesAfterClose * 60_000;
    if (
      inWindow(nowMs, weeklyTarget, grace) &&
      shouldRunRoutine('weekly', runs, tradingDate, cfg, nowMs)
    ) {
      due.push('weekly');
    }
  }

  return due;
}
