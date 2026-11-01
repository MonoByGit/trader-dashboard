import { barTradingDateUtc } from '../../../src/alpaca/daily-bars-partial';
import { fetchCryptoBars } from '../alpaca-bars';
import { tradingDateEt } from '@scheduler/decide';
import { isDailyBarComplete } from '../../../src/momentum2/daily-bar-complete';
import { decideDay, executeDay } from '../../../src/momentum2/live';
import { resolveMomentumPaperMode } from '../../../src/momentum2/mode';
import type { Bar } from '../../../src/momentum2/types';
import { m6Config } from '../../../src/momentum6/config';
import { m6Hooks } from '../../../src/momentum6/plan';
import { brokerForMode, foreignQtyOtherSleeves, loadOrInitRealBook, runReconcile } from '../momentum2/paper-run';
import { postgresStore } from '../momentum2/store';

const toBars = (x: Array<{ t: string; o: number; h: number; l: number; c: number; v: number }>): Bar[] =>
  x.map((b) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));

export async function runMomentum6(step: 'decide' | 'execute', nowMs = Date.now()): Promise<Record<string, unknown>> {
  const mode = resolveMomentumPaperMode(process.env, 'MOMENTUM6');
  if (!mode.run) return { skipped: true, reason: mode.reason };

  const cfg = m6Config();
  const store = postgresStore();
  const todayEt = tradingDateEt(nowMs);
  const todayUtc = new Date(nowMs).toISOString().slice(0, 10);
  const raw = await fetchCryptoBars({ symbols: cfg.universe, lookbackCalendarDays: 120 });
  const barsBySymbol: Record<string, Bar[]> = {};
  for (const [s, b] of Object.entries(raw)) {
    barsBySymbol[s] = toBars(b).filter((x) => x.t.slice(0, 10) < todayUtc);
  }
  const btc = barsBySymbol['BTC/USD'] ?? [];
  const lastBar = btc.at(-1);
  const cryptoDate = lastBar ? barTradingDateUtc(lastBar.t) : todayUtc;

  const lastPrice: Record<string, number> = {};
  for (const [s, b] of Object.entries(barsBySymbol)) {
    const last = b.at(-1);
    if (last) lastPrice[s] = last.c;
  }
  const broker = brokerForMode(mode, lastPrice);

  if (step === 'decide') {
    if (!btc.length) return { skipped: true, reason: 'geen BTC-bars' };
    if (
      !isDailyBarComplete({
        lastBarSessionDate: cryptoDate,
        sessionToday: todayUtc,
        marketOpen: false,
      })
    ) {
      return { skipped: true, reason: 'BTC dagbar nog niet compleet', step, cryptoDate, todayUtc };
    }
    if (!mode.shadow) await loadOrInitRealBook(store, cfg, btc.at(-1)?.c ?? null, cryptoDate);
    const { planned } = await decideDay({
      date: cryptoDate,
      cfgs: [cfg],
      hooks: m6Hooks,
      barsBySymbol,
      benchmark: btc,
      store,
      expectReal: !mode.shadow,
    });
    const out: Record<string, unknown> = { step, date: cryptoDate, shadow: mode.shadow, planned };
    if (!mode.shadow) {
      out.reconcile = await runReconcile({ date: cryptoDate, cfgs: [cfg], store, hooks: m6Hooks, barsBySymbol, broker });
    }
    return out;
  }

  if (!mode.shadow) {
    const benchLast = btc.at(-1)?.c ?? null;
    await loadOrInitRealBook(store, cfg, benchLast, todayEt);
  }

  const r = await executeDay({
    date: todayEt, cfgs: [cfg], hooks: m6Hooks, lastPrice, barsBySymbol, broker, store,
    expectReal: !mode.shadow, foreignQty: foreignQtyOtherSleeves,
  });
  const reconcile = mode.shadow
    ? undefined
    : await runReconcile({ date: todayEt, cfgs: [cfg], store, hooks: m6Hooks, barsBySymbol, broker });
  return { step, date: todayEt, shadow: mode.shadow, trades: r.trades.length, reconcile };
}
