import type { Bar, Position, VersionBook, VersionConfig } from './types';

export type StopKind = 'hard' | 'trailing';

/** Stopniveau op basis van de stand vóór de huidige dag: harde stop bij entry, trailing meebewegend. */
export function stopLevel(
  pos: Pick<Position, 'entryPrice' | 'highWater'>,
  cfg: Pick<VersionConfig, 'hardStopPct' | 'trailingStopPct'>,
): { level: number; kind: StopKind } {
  const hard = pos.entryPrice * (1 - cfg.hardStopPct);
  const trail = pos.highWater * (1 - cfg.trailingStopPct);
  return trail > hard ? { level: trail, kind: 'trailing' } : { level: hard, kind: 'hard' };
}

/** Raakt de dagbar het stopniveau? Gap onder de stop vult op de open (slechter dan de stop). */
export function checkStop(
  pos: Pick<Position, 'entryPrice' | 'highWater'>,
  bar: Pick<Bar, 'o' | 'l'>,
  cfg: Pick<VersionConfig, 'hardStopPct' | 'trailingStopPct'>,
): { hit: false } | { hit: true; fillPrice: number; kind: StopKind } {
  const { level, kind } = stopLevel(pos, cfg);
  if (bar.l > level) return { hit: false };
  return { hit: true, fillPrice: Math.min(bar.o, level), kind };
}

export function lossLimitBreached(
  equity: number,
  book: Pick<VersionBook, 'startBudgetUsd'>,
  cfg: Pick<VersionConfig, 'maxLossPct'>,
): boolean {
  return equity <= book.startBudgetUsd * (1 - cfg.maxLossPct);
}

/** Basis voor positiegrootte: meebewegend = huidige equity, anders het startbudget (nooit meer dan equity). */
export function sizingBase(
  equity: number,
  book: Pick<VersionBook, 'startBudgetUsd'>,
  cfg: Pick<VersionConfig, 'floatingBudget' | 'maxGrossPct'>,
): number {
  const base = cfg.floatingBudget ? equity : Math.min(equity, book.startBudgetUsd);
  return base * cfg.maxGrossPct;
}
