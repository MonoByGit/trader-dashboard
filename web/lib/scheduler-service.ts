import '@/lib/cron-routines';
import '@/lib/crypto-routines';
import { decideDueRoutines, tradingDateEt, type CalendarDay } from '@scheduler/decide';
import { decideCryptoTickDue } from '@crypto/scheduler';
import { loadCryptoGuardConfig } from '@crypto/config';
import { isCryptoModuleEnabled } from '@/lib/crypto/enabled';
import { alpaca } from './alpaca';
import { dispatchRoutine } from './routine-dispatch';
import { getLastFinishedRunMs, listRunsForTradingDate } from './routine-runs';

function weekBoundsEt(nowMs: number): { start: string; end: string } {
  const tradingDate = tradingDateEt(nowMs);
  const d = new Date(`${tradingDate}T12:00:00Z`);
  const day = d.getUTCDay();
  const monOffset = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() + monOffset);
  const fri = new Date(mon);
  fri.setUTCDate(mon.getUTCDate() + 4);
  const fmt = (x: Date) => x.toISOString().slice(0, 10);
  return { start: fmt(mon), end: fmt(fri) };
}

export async function runSchedulerTick(nowMs: number = Date.now()): Promise<{
  tradingDate: string;
  due: string[];
  cryptoDue: boolean;
  results: Record<string, unknown>;
}> {
  const tradingDate = tradingDateEt(nowMs);
  const { start, end } = weekBoundsEt(nowMs);
  const cal = await alpaca.calendar(start, end);
  const calendarToday =
    cal.find((c) => c.date === tradingDate) ?? null;
  const calendarThisWeek = cal as CalendarDay[];

  const runs = await listRunsForTradingDate(tradingDate);
  const runRecords = runs.map((r) => ({
    routine: r.routine,
    trading_date: r.trading_date,
    status: r.status === 'running' ? 'failed' : r.status,
    finished_at: r.finished_at,
  }));

  const due = decideDueRoutines({
    nowMs,
    calendarToday,
    calendarThisWeek,
    runs: runRecords,
  });

  const results: Record<string, unknown> = {};
  for (const routine of due) {
    results[routine] = await dispatchRoutine(routine);
  }

  const cryptoEnabled = await isCryptoModuleEnabled();
  const cryptoCfg = loadCryptoGuardConfig();
  const lastCryptoMs = await getLastFinishedRunMs('crypto-tick');
  const cryptoDue =
    cryptoEnabled &&
    decideCryptoTickDue({
      nowMs,
      intervalHours: cryptoCfg.tickIntervalHours,
      lastFinishedAtMs: lastCryptoMs,
    });

  if (cryptoDue) {
    results['crypto-tick'] = await dispatchRoutine('crypto-tick');
  }

  return { tradingDate, due, cryptoDue: !!cryptoDue, results };
}
