/** 24/7 crypto tick scheduling (no US market calendar). */

export interface CryptoSchedulerConfig {
  intervalHours: number;
  graceMinutes: number;
}

export const DEFAULT_CRYPTO_SCHEDULER_CONFIG: CryptoSchedulerConfig = {
  intervalHours: 2,
  graceMinutes: 10,
};

export function utcDateString(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/**
 * Returns true when a crypto tick should run: first run ever, or interval elapsed
 * since last successful/finished tick. Works on weekends (no market dependency).
 */
export function decideCryptoTickDue(input: {
  nowMs: number;
  intervalHours: number;
  lastFinishedAtMs: number | null;
  graceMinutes?: number;
}): boolean {
  const grace = (input.graceMinutes ?? DEFAULT_CRYPTO_SCHEDULER_CONFIG.graceMinutes) * 60_000;
  const intervalMs = input.intervalHours * 3_600_000;

  if (input.lastFinishedAtMs == null || !Number.isFinite(input.lastFinishedAtMs)) {
    return true;
  }

  return input.nowMs >= input.lastFinishedAtMs + intervalMs - grace;
}
