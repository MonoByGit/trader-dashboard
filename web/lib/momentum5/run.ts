import { alpaca } from '../alpaca';
import { fetchStockDailyBars } from '../alpaca-bars';
import { tradingDateEt } from '@scheduler/decide';
import { isDailyBarComplete } from '../../../src/momentum2/daily-bar-complete';
import { decideDay, executeDay } from '../../../src/momentum2/live';
import { resolveMomentumPaperMode } from '../../../src/momentum2/mode';
import type { Bar } from '../../../src/momentum2/types';
import { m5Versions } from '../../../src/momentum5/config';
import { m5Hooks } from '../../../src/momentum5/plan';
import { brokerForMode, foreignQtyOtherSleeves, loadOrInitRealBook, runReconcile } from '../momentum2/paper-run';
import { postgresStore } from '../momentum2/store';

const toBars = (x: Array<{ t: string; o: number; h: number; l: number; c: number; v: number }>): Bar[] =>
  x.map((b) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));

export async function runMomentum5(step: 'decide' | 'execute', nowMs = Date.now()): Promise<Record<string, unknown>> {
  const mode = resolveMomentumPaperMode(process.env, 'MOMENTUM5');
  if (!mode.run) return { skipped: true, reason: mode.reason };

  const cfgs = m5Versions();
  const store = postgresStore();
  const today = tradingDateEt(nowMs);
  const syms = Array.from(new Set(cfgs.flatMap((c) => [c.signalSymbol, c.riskSymbol, c.cashSymbol, 'SPY'])));
  const raw = await fetchStockDailyBars({ symbols: syms, lookbackCalendarDays: 420, adjustment: 'all' });
  const barsBySymbol: Record<string, Bar[]> = {};
  for (const [s, b] of Object.entries(raw)) barsBySymbol[s] = toBars(b);
  const spy = barsBySymbol.SPY ?? [];
  const clock = await alpaca.clock();

  const lastPrice: Record<string, number> = {};
  for (const [s, b] of Object.entries(barsBySymbol)) {
    const last = b.at(-1);
    if (last) lastPrice[s] = last.c;
  }
  const broker = brokerForMode(mode, lastPrice);

  if (step === 'decide') {
    const qqqLast = barsBySymbol.QQQ?.at(-1);
    const lastBarDate = qqqLast?.t.slice(0, 10);
    if (!lastBarDate) {
      return { skipped: true, reason: 'geen QQQ-bars', step, date: today };
    }
    if (
      !isDailyBarComplete({
        lastBarSessionDate: lastBarDate,
        sessionToday: today,
        marketOpen: clock.is_open,
      })
    ) {
      return { skipped: true, reason: 'QQQ dagbar nog niet gesloten', step, date: today, lastBarDate };
    }
    const decideDate = lastBarDate;
    const out: Record<string, unknown> = { step, date: decideDate, shadow: mode.shadow };
    if (!mode.shadow) {
      // papier beslist alleen op een papierboek, nooit op een schaduwboek
      const spyLast = spy.at(-1)?.c ?? null;
      for (const cfg of cfgs) await loadOrInitRealBook(store, cfg, spyLast, decideDate);
    }
    for (const cfg of cfgs) {
      out[cfg.id] = (await decideDay({
        date: decideDate, cfgs: [cfg], hooks: m5Hooks, barsBySymbol, benchmark: spy, store, expectReal: !mode.shadow,
      })).planned;
    }
    if (!mode.shadow) {
      out.reconcile = await runReconcile({ date: decideDate, cfgs, store, hooks: m5Hooks, barsBySymbol, broker });
    }
    return out;
  }

  if (!clock.is_open) {
    return { skipped: true, reason: 'markt gesloten', step, date: today };
  }

  if (!mode.shadow) {
    const spyLast = spy.at(-1)?.c ?? null;
    for (const cfg of cfgs) await loadOrInitRealBook(store, cfg, spyLast, today);
  }

  let trades = 0;
  for (const cfg of cfgs) {
    const r = await executeDay({
      date: today, cfgs: [cfg], hooks: m5Hooks, lastPrice, barsBySymbol, broker, store,
      expectReal: !mode.shadow, foreignQty: foreignQtyOtherSleeves,
    });
    trades += r.trades.length;
  }
  const reconcile = mode.shadow ? undefined : await runReconcile({ date: today, cfgs, store, hooks: m5Hooks, barsBySymbol, broker });
  return { step, date: today, shadow: mode.shadow, trades, reconcile };
}
