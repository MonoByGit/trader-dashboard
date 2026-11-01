import { alpaca } from '../alpaca';
import { fetchStockDailyBars } from '../alpaca-bars';
import { tradingDateEt } from '@scheduler/decide';
import { resolveShadowMode } from '../../../src/momentum2/mode';
import { decideDay, executeDay } from '../../../src/momentum2/live';
import type { Bar } from '../../../src/momentum2/types';
import { m5Versions } from '../../../src/momentum5/config';
import { m5Hooks } from '../../../src/momentum5/plan';
import { shadowBroker } from '../momentum2/broker';
import { postgresStore } from '../momentum2/store';

const toBars = (x: Array<{ t: string; o: number; h: number; l: number; c: number; v: number }>): Bar[] =>
  x.map((b) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));

export async function runMomentum5(step: 'decide' | 'execute', nowMs = Date.now()): Promise<Record<string, unknown>> {
  const mode = resolveShadowMode(process.env, 'MOMENTUM5');
  if (!mode.run) return { skipped: true, reason: mode.reason };

  const cfgs = m5Versions();
  const store = postgresStore();
  const today = tradingDateEt(nowMs);
  const syms = Array.from(new Set(cfgs.flatMap((c) => [c.signalSymbol, c.riskSymbol, c.cashSymbol, 'SPY'])));
  const raw = await fetchStockDailyBars({ symbols: syms, lookbackCalendarDays: 420, adjustment: 'all' });
  const barsBySymbol: Record<string, Bar[]> = {};
  for (const [s, b] of Object.entries(raw)) barsBySymbol[s] = toBars(b);
  const spy = barsBySymbol.SPY ?? [];

  if (step === 'decide') {
    const qqqLast = barsBySymbol.QQQ?.at(-1)?.t.slice(0, 10);
    if (qqqLast !== today) {
      return { skipped: true, reason: 'geen slotbar QQQ voor vandaag', step, date: today };
    }
    const out: Record<string, unknown> = { step, date: today, shadow: true };
    for (const cfg of cfgs) {
      out[cfg.id] = (await decideDay({ date: today, cfgs: [cfg], hooks: m5Hooks, barsBySymbol, benchmark: spy, store })).planned;
    }
    return out;
  }

  const clock = await alpaca.clock();
  if (!clock.is_open) {
    return { skipped: true, reason: 'markt gesloten', step, date: today };
  }

  const lastPrice: Record<string, number> = {};
  for (const [s, b] of Object.entries(barsBySymbol)) {
    const last = b.at(-1);
    if (last) lastPrice[s] = last.c;
  }
  const broker = shadowBroker(lastPrice);
  let trades = 0;
  for (const cfg of cfgs) {
    const r = await executeDay({ date: today, cfgs: [cfg], hooks: m5Hooks, lastPrice, barsBySymbol, broker, store });
    trades += r.trades.length;
  }
  return { step, date: today, shadow: true, trades };
}
