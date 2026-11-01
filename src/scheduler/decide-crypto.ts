export type CryptoRoutineName = 'crypto-scan';

import { RUNNING_STALE_MS } from './run-status.js';
import { utcCryptoScanSlot } from './crypto-slot.js';

export interface CryptoRunRecord {
  routine: string;
  status: string;
  finished_at?: string | null;
  started_at?: string | null;
}

export interface CryptoSchedulerConfig {
  tickIntervalHours: number;
  tickGraceMinutes: number;
  retryWindowMinutes: number;
}

export const DEFAULT_CRYPTO_SCHEDULER_CONFIG: CryptoSchedulerConfig = {
  tickIntervalHours: 2,
  tickGraceMinutes: 10,
  retryWindowMinutes: 45,
};

export function utcDateYmd(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function lastRun(runs: CryptoRunRecord[]): CryptoRunRecord | undefined {
  return runs
    .filter((r) => r.routine === 'crypto-scan')
    .sort((a, b) =>
      (b.finished_at ?? b.started_at ?? '').localeCompare(a.finished_at ?? a.started_at ?? ''),
    )[0];
}

function dueOnSlotAfterLastFinish(
  last: CryptoRunRecord,
  cfg: CryptoSchedulerConfig,
  nowMs: number,
): boolean {
  const anchor = last.finished_at ?? last.started_at;
  if (!anchor) return true;
  const currentSlot = utcCryptoScanSlot(nowMs, cfg.tickIntervalHours);
  const lastSlot = utcCryptoScanSlot(new Date(anchor).getTime(), cfg.tickIntervalHours);
  return currentSlot !== lastSlot;
}

function shouldRunCrypto(
  runs: CryptoRunRecord[],
  cfg: CryptoSchedulerConfig,
  nowMs: number,
): boolean {
  const last = lastRun(runs);
  if (!last) return true;
  if (last.status === 'running') {
    if (!last.started_at) return false;
    const age = nowMs - new Date(last.started_at).getTime();
    return age >= RUNNING_STALE_MS;
  }
  if (last.status === 'failed' && last.finished_at) {
    const finishedMs = new Date(last.finished_at).getTime();
    if (nowMs - finishedMs <= cfg.retryWindowMinutes * 60_000) return true;
    return dueOnSlotAfterLastFinish(last, cfg, nowMs);
  }
  if (last.status === 'failed' && !last.finished_at) return false;
  if (last.status === 'ok' && last.finished_at) {
    return dueOnSlotAfterLastFinish(last, cfg, nowMs);
  }
  if (last.status === 'skipped') return true;
  return false;
}

/** 24/7 UTC grid: every N hours on the hour (no US market calendar). */
export function decideDueCryptoRoutines(input: {
  nowMs: number;
  runs: CryptoRunRecord[];
  config?: Partial<CryptoSchedulerConfig & { tickIntervalHours?: number }>;
}): CryptoRoutineName[] {
  const cfg = {
    ...DEFAULT_CRYPTO_SCHEDULER_CONFIG,
    ...input.config,
    tickIntervalHours: input.config?.tickIntervalHours ?? DEFAULT_CRYPTO_SCHEDULER_CONFIG.tickIntervalHours,
  };
  const { nowMs, runs } = input;
  const d = new Date(nowMs);
  const hour = d.getUTCHours();
  const minute = d.getUTCMinutes();
  const grace = cfg.tickGraceMinutes;

  if (hour % cfg.tickIntervalHours !== 0) return [];
  if (minute > grace) return [];

  if (!shouldRunCrypto(runs, cfg, nowMs)) return [];

  return ['crypto-scan'];
}
