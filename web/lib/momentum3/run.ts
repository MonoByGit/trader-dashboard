import { alpaca } from '../alpaca';
import { fetchCryptoBars, fetchStockDailyBars } from '../alpaca-bars';
import { tradingDateEt } from '@scheduler/decide';
import { resolveShadowMode } from '../../../src/momentum2/mode';
import { decideDay, executeDay } from '../../../src/momentum2/live';
import type { Bar } from '../../../src/momentum2/types';
import { m3Versions } from '../../../src/momentum3/config';
import { m3Hooks } from '../../../src/momentum3/plan';
import { shadowBroker } from '../momentum2/broker';
import { postgresStore } from '../momentum2/store';

const toBars = (x: Array<{ t: string; o: number; h: number; l: number; c: number; v: number }>): Bar[] =>
  x.map((b) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));

/** Momentum 3: alleen schaduw. Geen enkele order naar Alpaca, ook niet met MOMENTUM3_DRY_RUN=0 (wordt geweigerd). */
export async function runMomentum3(step: 'decide' | 'execute', nowMs = Date.now()): Promise<Record<string, unknown>> {
  const mode = resolveShadowMode(process.env, 'MOMENTUM3');
  if (!mode.run) return { skipped: true, reason: mode.reason };

  const [cryptoCfg, etfCfg] = m3Versions();
  const store = postgresStore();
  const today = tradingDateEt(nowMs);
  const todayUtc = new Date(nowMs).toISOString().slice(0, 10);

  const cryptoRaw = await fetchCryptoBars({ symbols: cryptoCfg!.universe, lookbackCalendarDays: 120 });
  const cryptoBars: Record<string, Bar[]> = {};
  for (const [s, b] of Object.entries(cryptoRaw)) cryptoBars[s] = toBars(b).filter((x) => x.t.slice(0, 10) < todayUtc); // alleen afgesloten dagen
  const etfSymbols = Array.from(new Set(['SPY', ...etfCfg!.universe]));
  const etfBars: Record<string, Bar[]> = {};
  for (const [s, b] of Object.entries(await fetchStockDailyBars({ symbols: etfSymbols, lookbackCalendarDays: 420, adjustment: 'split' }))) {
    etfBars[s] = toBars(b);
  }

  if (step === 'decide') {
    const btc = cryptoBars['BTC/USD'] ?? [];
    const cryptoDate = btc.at(-1)?.t.slice(0, 10);
    const out: Record<string, unknown> = { step, date: today, shadow: true };
    if (cryptoDate) {
      out.crypto = (await decideDay({ date: cryptoDate, cfgs: [cryptoCfg!], hooks: m3Hooks, barsBySymbol: cryptoBars, benchmark: btc, store })).planned;
    }
    const spy = etfBars.SPY ?? [];
    if (spy.at(-1)?.t.slice(0, 10) === today) {
      out.etf = (await decideDay({ date: today, cfgs: [etfCfg!], hooks: m3Hooks, barsBySymbol: etfBars, benchmark: spy, store })).planned;
    } else {
      out.etf = { skipped: 'geen slotbar voor vandaag' };
    }
    return out;
  }

  const lastPrice: Record<string, number> = {};
  for (const [s, b] of [...Object.entries(cryptoBars), ...Object.entries(etfBars)]) {
    const last = b.at(-1);
    if (last) lastPrice[s] = last.c;
  }
  const broker = shadowBroker(lastPrice);
  const a = await executeDay({ date: today, cfgs: [cryptoCfg!], hooks: m3Hooks, lastPrice, barsBySymbol: cryptoBars, broker, store });
  const clock = await alpaca.clock();
  const e = clock.is_open
    ? await executeDay({ date: today, cfgs: [etfCfg!], hooks: m3Hooks, lastPrice, barsBySymbol: etfBars, broker, store })
    : { trades: [] };
  return { step, date: today, shadow: true, trades: a.trades.length + e.trades.length };
}
