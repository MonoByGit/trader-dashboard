import { toTradingDateString } from './trading-date.js';

/** DATE or timestamptz-derived date from node-pg (Date or YYYY-MM-DD string). */
export function pgDateToYmd(value: unknown): string {
  return toTradingDateString(value);
}

/** TIMESTAMPTZ from node-pg as ISO string. */
export function pgTimestampToIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString();
  }
  if (typeof value === 'string') return value;
  return String(value);
}

export function compareYmdDesc(a: unknown, b: unknown): number {
  return pgDateToYmd(b).localeCompare(pgDateToYmd(a));
}

export function compareYmdAsc(a: unknown, b: unknown): number {
  return pgDateToYmd(a).localeCompare(pgDateToYmd(b));
}

export function compareTimestampMs(a: unknown, b: unknown): number {
  const ta = a instanceof Date ? a.getTime() : new Date(String(a ?? 0)).getTime();
  const tb = b instanceof Date ? b.getTime() : new Date(String(b ?? 0)).getTime();
  return ta - tb;
}

/** HH:MM from a pg TIMESTAMPTZ (Date or ISO string). */
export function pgTimestampToHm(value: unknown): string {
  const iso = pgTimestampToIso(value) ?? '';
  if (iso.length >= 16) return iso.slice(11, 16);
  const d = value instanceof Date ? value : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(11, 16);
}
