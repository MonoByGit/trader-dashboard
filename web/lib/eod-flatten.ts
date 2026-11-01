import { alpaca } from '@/lib/alpaca';
import { cancelSellLegsAndWait } from '@/lib/alpaca-orders';
import { logGuardEvent } from '@/lib/guards/service';

export type EodFlattenResult =
  | { ok: true; symbol: string }
  | { ok: false; symbol: string; error: string; cancelReady: boolean; remainingLegs: number };

export async function flattenEtfPositionAtEod(symbol: string): Promise<EodFlattenResult> {
  const cancel = await cancelSellLegsAndWait(symbol);
  if (!cancel.ready) {
    const msg = `EOD flatten ${symbol}: bracket legs still open after cancel (${cancel.remainingLegs.length})`;
    await logGuardEvent('eod_flatten_cancel_stuck', msg, {
      symbol,
      remaining: cancel.remainingLegs,
    });
    console.error('[eod-flatten]', msg);
    return {
      ok: false,
      symbol,
      error: msg,
      cancelReady: false,
      remainingLegs: cancel.remainingLegs.length,
    };
  }

  try {
    await alpaca.closePosition(symbol);
    return { ok: true, symbol };
  } catch (e) {
    const error = String(e);
    await logGuardEvent('eod_flatten_close_fail', error, { symbol, cancelledLegs: cancel.cancelled });
    console.error('[eod-flatten]', symbol, error);
    return {
      ok: false,
      symbol,
      error,
      cancelReady: true,
      remainingLegs: 0,
    };
  }
}
