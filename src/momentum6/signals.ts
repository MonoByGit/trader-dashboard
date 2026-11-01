import { closesOf, dateOf } from '../momentum2/indicators';
import type { Bar } from '../momentum2/types';
import type { M6Config } from './config';

/** Instap: slot boven hoogste close van de vorige N dagen (exclusief vandaag). */
export function breakoutEntry(bars: Bar[], cfg: Pick<M6Config, 'breakoutDays'>): boolean {
  if (bars.length < cfg.breakoutDays + 1) return false;
  const closes = closesOf(bars);
  const today = closes[closes.length - 1]!;
  const prev = closes.slice(-cfg.breakoutDays - 1, -1);
  if (prev.some((x) => !Number.isFinite(x))) return false;
  return today > Math.max(...prev);
}

/** Uitstap: slot onder het minimum van de vorige M closes (exclusief vandaag). */
/** 12% trail t.o.v. hoogste close sinds instap (exclusief vandaag). */
export function exitTrailFromPeakClose(
  bars: Bar[],
  cfg: Pick<M6Config, 'trailFromPeakPct'>,
  sinceDate: string,
): boolean {
  const entryIdx = bars.findIndex((b) => dateOf(b) >= sinceDate.slice(0, 10));
  if (entryIdx < 0 || bars.length < entryIdx + 2) return false;
  const closes = closesOf(bars);
  const hist = closes.slice(entryIdx, -1);
  if (hist.length === 0) return false;
  const peak = Math.max(...hist);
  const today = closes[closes.length - 1]!;
  return today < peak * (1 - cfg.trailFromPeakPct);
}

export function exitBelowLow(bars: Bar[], cfg: Pick<M6Config, 'exitLowDays'>): boolean {
  if (bars.length < cfg.exitLowDays + 1) return false;
  const closes = closesOf(bars);
  const today = closes[closes.length - 1]!;
  const prev = closes.slice(-cfg.exitLowDays - 1, -1);
  return today < Math.min(...prev);
}

export const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export function barsThroughYesterday(bars: Bar[], asOfDate: string): Bar[] {
  const out: Bar[] = [];
  for (const b of bars) {
    if (dateOf(b) >= asOfDate) break;
    out.push(b);
  }
  return out;
}
