import '@/lib/cron-routines';
import '@/lib/crypto/routines';
import { decideDueCryptoRoutines } from '@scheduler/decide-crypto';
import { loadCryptoGuardConfig } from '@guards/crypto-config';
import { decideDueRoutines, tradingDateEt, type CalendarDay } from '@scheduler/decide';
import { alpaca } from './alpaca';
import { dispatchRoutine } from './routine-dispatch';
import { logGuardEvent } from '@/lib/guards/service';
import { ensureSchema } from '@/lib/migrate';
import { runMomentumShadowTick } from './momentum-tick';
import {
  listRecentRunsByRoutine,
  listRunsForTradingDate,
  recordFailedRoutineRunAttempt,
} from './routine-runs';

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

function schedulerTickErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function schedulerTickErrorStack(e: unknown): string | undefined {
  return e instanceof Error ? e.stack : undefined;
}

export async function runSchedulerTick(nowMs: number = Date.now()): Promise<{
  tradingDate: string;
  due: string[];
  results: Record<string, unknown>;
  tickErrors?: string[];
}> {
  await ensureSchema();
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
    status: r.status,
    finished_at: r.finished_at,
    started_at: r.started_at,
  }));

  const dueEtf = decideDueRoutines({
    nowMs,
    calendarToday,
    calendarThisWeek,
    runs: runRecords,
  });

  const cryptoCfg = loadCryptoGuardConfig();
  const cryptoRuns = await listRecentRunsByRoutine('crypto-scan', 20);
  const dueCrypto = decideDueCryptoRoutines({
    nowMs,
    runs: cryptoRuns.map((r) => ({
      routine: r.routine,
      status: r.status,
      finished_at: r.finished_at,
      started_at: r.started_at,
    })),
    config: { tickIntervalHours: cryptoCfg.tickIntervalHours },
  });

  const due = [...dueEtf, ...dueCrypto];

  const results: Record<string, unknown> = {};
  const tickErrors: string[] = [];

  for (const routine of due) {
    try {
      results[routine] = await dispatchRoutine(routine, nowMs);
    } catch (e) {
      const msg = schedulerTickErrorMessage(e);
      const stack = schedulerTickErrorStack(e);
      console.error('[scheduler-tick] failed', { routine, message: msg, stack });
      tickErrors.push(`${routine}: ${msg}`);
      await recordFailedRoutineRunAttempt(routine, tradingDate, msg, nowMs);
      try {
        await logGuardEvent('scheduler_tick_fail', msg, { routine, tradingDate });
      } catch (logErr) {
        console.error('[scheduler-tick] failed to log guard event', logErr);
      }
      results[routine] = { error: msg };
    }
  }

  // Momentum 2/3/5/6: alleen schaduw, nooit een reden om de rest van de tick te laten falen.
  try {
    const momentum = await runMomentumShadowTick(nowMs, calendarToday);
    if (Object.keys(momentum).length) results['momentum-shadow'] = momentum;
  } catch (e) {
    const msg = schedulerTickErrorMessage(e);
    console.error('[scheduler-tick] momentum-shadow failed', msg);
    tickErrors.push(`momentum-shadow: ${msg}`);
  }

  return tickErrors.length ? { tradingDate, due, results, tickErrors } : { tradingDate, due, results };
}
