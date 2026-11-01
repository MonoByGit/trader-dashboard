import type { GuardConfig } from './config';
import type { AlpacaClockLike, EodClosePlan } from './types';

function parseMs(iso: string): number {
  return new Date(iso).getTime();
}

/**
 * Decide whether EOD may flatten (market close) or must keep bracket protection.
 * Safe when cron runs early, late, or after the bell.
 */
export function planEodClose(
  clock: AlpacaClockLike,
  hasOpenPositions: boolean,
  config: GuardConfig,
  nowMs: number = Date.now()
): EodClosePlan {
  if (!hasOpenPositions) {
    return { action: 'skip_no_positions', reason: 'No open positions' };
  }

  const closeMs = parseMs(clock.next_close);
  const openMs = parseMs(clock.next_open);
  const tsMs = parseMs(clock.timestamp);

  if (clock.is_open) {
    const minutesToClose = (closeMs - tsMs) / 60_000;
    if (minutesToClose >= config.eodMinMinutesBeforeClose) {
      return {
        action: 'flatten',
        reason: `Market open with ${minutesToClose.toFixed(1)} min until close`,
      };
    }
    return {
      action: 'keep_brackets',
      reason: `Too close to bell (${minutesToClose.toFixed(1)} min) — keeping bracket stops`,
    };
  }

  // Market closed: only flatten if we're still within a short window after the close
  // (same session). Otherwise bracket orders must stay — a market close would not fill.
  const minutesSinceClose = (nowMs - closeMs) / 60_000;
  if (minutesSinceClose >= 0 && minutesSinceClose <= config.eodMaxMinutesAfterClose) {
    return {
      action: 'keep_brackets',
      reason: `Market closed ${minutesSinceClose.toFixed(1)} min ago — not canceling protection`,
    };
  }

  // Before next open on a non-trading gap: keep brackets if positions exist
  if (nowMs < openMs) {
    return {
      action: 'keep_brackets',
      reason: 'Market closed — overnight protection via existing brackets',
    };
  }

  return {
    action: 'keep_brackets',
    reason: 'Market closed — flatten skipped to avoid unprotected overnight exposure',
  };
}
