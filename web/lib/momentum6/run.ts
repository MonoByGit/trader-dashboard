import { fetchCryptoBars } from '../alpaca-bars';
import { tradingDateEt } from '@scheduler/decide';
import { resolveShadowMode } from '../../../src/momentum2/mode';
import { decideDay, executeDay } from '../../../src/momentum2/live';
import type { Bar } from '../../../src/momentum2/types';
import { m6Config } from '../../../src/momentum6/config';
import { m6Hooks } from '../../../src/momentum6/plan';
import { shadowBroker } from '../momentum2/broker';
import { postgresStore } from '../momentum2/store';

const toBars = (x: Array<{ t: string; o: number; h: number; l: number; c: number; v: number }>): Bar[] =>
  x.map((b) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));

export async function runMomentum6(step: 'decide' | 'execute', nowMs = Date.now()): Promise<Record<string, unknown>> {
  const mode = resolveShadowMode(process.env, 'MOMENTUM6');
  if (!mode.run) return { skipped: true, reason: mode.reason };

  const cfg = m6Config();
  const store = postgresStore();
  const today = tradingDateEt(nowMs);
  const todayUtc = new Date(nowMs).toISOString().slice(0, 10);
  const raw = await fetchCryptoBars({ symbols: cfg.universe, lookbackCalendarDays: 120 });
  const barsBySymbol: Record<string, Bar[]> = {};
  for (const [s, b] of Object.entries(raw)) {
    barsBySymbol[s] = toBars(b).filter((x) => x.t.slice(0, 10) < todayUtc);
  }
  const btc = barsBySymbol['BTC/USD'] ?? [];
  const cryptoDate = btc.at(-1)?.t.slice(0, 10) ?? today;

  if (step === 'decide') {
    if (!btc.length) return { skipped: true, reason: 'geen BTC-bars' };
    const { planned } = await decideDay({ date: cryptoDate, cfgs: [cfg], hooks: m6Hooks, barsBySymbol, benchmark: btc, store });
    return { step, date: cryptoDate, shadow: true, planned };
  }

  const lastPrice: Record<string, number> = {};
  for (const [s, b] of Object.entries(barsBySymbol)) {
    const last = b.at(-1);
    if (last) lastPrice[s] = last.c;
  }
  const broker = shadowBroker(lastPrice);
  const r = await executeDay({ date: today, cfgs: [cfg], hooks: m6Hooks, lastPrice, barsBySymbol, broker, store });
  return { step, date: today, shadow: true, trades: r.trades.length };
}
