import { compareYmdDesc, pgDateToYmd } from '../dates/pg.js';

export interface AiCostPeriodRow {
  asset_class: string;
  cost_usd: number;
}

export interface AiCostDayRow extends AiCostPeriodRow {
  day: unknown;
}

export interface AiCostWeekRow extends AiCostPeriodRow {
  week_start: unknown;
}

export interface AiCostDayBucket {
  day: string;
  etf_usd: number;
  crypto_usd: number;
  cost_usd: number;
}

export interface AiCostWeekBucket {
  week_start: string;
  etf_usd: number;
  crypto_usd: number;
  cost_usd: number;
}

export function aggregateAiCostsByDay(raw: AiCostDayRow[], limit = 90): AiCostDayBucket[] {
  const dayMap = new Map<string, AiCostDayBucket>();
  for (const r of raw) {
    const key = pgDateToYmd(r.day);
    const entry = dayMap.get(key) ?? { day: key, etf_usd: 0, crypto_usd: 0, cost_usd: 0 };
    if (r.asset_class === 'crypto') entry.crypto_usd += r.cost_usd;
    else entry.etf_usd += r.cost_usd;
    entry.cost_usd += r.cost_usd;
    dayMap.set(key, entry);
  }
  return Array.from(dayMap.values())
    .sort((a, b) => compareYmdDesc(a.day, b.day))
    .slice(0, limit);
}

export function aggregateAiCostsByWeek(raw: AiCostWeekRow[]): AiCostWeekBucket[] {
  const weekMap = new Map<string, AiCostWeekBucket>();
  for (const r of raw) {
    const key = pgDateToYmd(r.week_start);
    const entry = weekMap.get(key) ?? { week_start: key, etf_usd: 0, crypto_usd: 0, cost_usd: 0 };
    if (r.asset_class === 'crypto') entry.crypto_usd += r.cost_usd;
    else entry.etf_usd += r.cost_usd;
    entry.cost_usd += r.cost_usd;
    weekMap.set(key, entry);
  }
  return Array.from(weekMap.values()).sort((a, b) => compareYmdDesc(a.week_start, b.week_start));
}
