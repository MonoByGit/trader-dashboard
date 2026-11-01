export type CryptoRoutineName = 'crypto-scan';

import { RUNNING_STALE_MS } from './run-status.js';
import { isInUtcCryptoSlotWindow, utcCryptoScanSlot } from './crypto-slot.js';

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

function anchorMs(anchor: string): number | null {
  const t = new Date(anchor).getTime();
  return Number.isFinite(t) ? t : null;
}

function dueOnSlotAfterLastFinish(
  last: CryptoRunRecord,
  cfg: CryptoSchedulerConfig,
  nowMs: number,
): boolean {
  const anchor = last.finished_at ?? last.started_at;
  if (!anchor) return true;
  const anchorTime = anchorMs(anchor);
  if (anchorTime == null) return true;
  const currentSlot = utcCryptoScanSlot(nowMs, cfg.tickIntervalHours);
  const lastSlot = utcCryptoScanSlot(anchorTime, cfg.tickIntervalHours);
  return currentSlot !== lastSlot && currentSlot !== '__invalid__' && lastSlot !== '__invalid__';
}

/** Any run row (including failed) started in the current UTC slot — prevents silent skip after tick 500. */
function hasRunStartedInCurrentSlot(
  runs: CryptoRunRecord[],
  nowMs: number,
  cfg: CryptoSchedulerConfig,
): boolean {
  const slot = utcCryptoScanSlot(nowMs, cfg.tickIntervalHours);
  if (slot === '__invalid__') return false;
  return runs.some((r) => {
    if (r.routine !== 'crypto-scan' || !r.started_at) return false;
    const t = anchorMs(r.started_at);
    if (t == null) return false;
    return utcCryptoScanSlot(t, cfg.tickIntervalHours) === slot;
  });
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
    const started = anchorMs(last.started_at);
    if (started == null) return true;
    const age = nowMs - started;
    return age >= RUNNING_STALE_MS;
  }
  if (last.status === 'failed' && last.finished_at) {
    const finishedMs = anchorMs(last.finished_at);
    if (finishedMs == null) return dueOnSlotAfterLastFinish(last, cfg, nowMs);
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

  const onGridHour = hour % cfg.tickIntervalHours === 0;
  const withinGrace = minute <= grace;

  if (onGridHour && withinGrace) {
    if (!shouldRunCrypto(runs, cfg, nowMs)) return [];
    return ['crypto-scan'];
  }

  // After grace within the same UTC slot (e.g. tick 500 at 10:07Z, retry at 10:12Z).
  if (
    lastRun(runs) != null &&
    isInUtcCryptoSlotWindow(nowMs, cfg.tickIntervalHours) &&
    !withinGrace &&
    !hasRunStartedInCurrentSlot(runs, nowMs, cfg) &&
    shouldRunCrypto(runs, cfg, nowMs)
  ) {
    return ['crypto-scan'];
  }

  return [];
}
