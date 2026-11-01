import { alpaca } from '../alpaca';
import { fetchStockDailyBars } from '../alpaca-bars';
import { tradingDateEt } from '@scheduler/decide';
import { DEFAULT_VERSIONS } from '../../../src/momentum2/config';
import { decideDay, executeDay } from '../../../src/momentum2/live';
import type { Bar } from '../../../src/momentum2/types';
import { resolveMomentum2Mode } from '../../../src/momentum2/mode';
import { shadowBroker } from './broker';
import { liveVeto } from './live-veto';
import { postgresStore } from './store';

export type Momentum2Step = 'decide' | 'execute';

async function loadBars(symbols: string[]) {
  const raw = await fetchStockDailyBars({ symbols, lookbackCalendarDays: 420, adjustment: 'split' });
  const out: Record<string, Bar[]> = {};
  for (const [s, bars] of Object.entries(raw)) out[s] = bars.map((b) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));
  return out;
}

export async function runMomentum2(step: Momentum2Step, nowMs = Date.now()): Promise<Record<string, unknown>> {
  // Alleen schaduwmodus: er bestaat in deze versie geen pad naar echte orders (zie mode.ts).
  const mode = resolveMomentum2Mode(process.env);
  if (!mode.run) return { skipped: true, reason: mode.reason };
  const shadow = true;
  const cfgs = DEFAULT_VERSIONS;
  const symbols = Array.from(new Set(['SPY', ...cfgs.flatMap((c) => c.universe)]));
  const store = postgresStore();
  const clock = await alpaca.clock();
  const today = tradingDateEt(nowMs);

  if (step === 'decide') {
    const bars = await loadBars(symbols);
    const benchmark = bars.SPY ?? [];
    const last = benchmark[benchmark.length - 1];
    if (!last || last.t.slice(0, 10) !== today) return { skipped: true, reason: 'geen slotbar voor vandaag (feestdag of data nog niet binnen)' };
    const veto = liveVeto();
    const { planned } = await decideDay({ date: today, cfgs, barsBySymbol: bars, benchmark, store, veto });
    return { step, shadow, date: today, planned };
  }

  if (!clock.is_open) return { skipped: true, reason: 'markt is dicht' };
  const quotes = await alpaca.latestQuotes(symbols);
  const lastPrice: Record<string, number> = {};
  for (const [s, q] of Object.entries(quotes.quotes ?? {})) {
    const px = (q.ap && q.bp ? (q.ap + q.bp) / 2 : q.ap || q.bp) || 0;
    if (px > 0) lastPrice[s] = px;
  }
  const broker = shadowBroker(lastPrice);
  const { trades } = await executeDay({ date: today, cfgs, lastPrice, broker, store });
  return { step, shadow, date: today, trades: trades.length };
}
