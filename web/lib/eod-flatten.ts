import { alpaca, AlpacaPosition } from '@/lib/alpaca';
import { cancelSellLegsAndWait } from '@/lib/alpaca-orders';
import { logGuardEvent } from '@/lib/guards/service';
import { retryAsync } from '../../src/trading/eod-close-retry';
import { getActiveStrategyContent } from '@/lib/strategy-versions';

export type EodFlattenResult =
  | { ok: true; symbol: string }
  | { ok: false; symbol: string; error: string; cancelReady: boolean; remainingLegs: number; restopPlaced?: boolean };

async function eodHardStopPct(): Promise<number> {
  const strat = await getActiveStrategyContent();
  return strat.rules.hard_stop_pct ?? 0.02;
}

async function placeEodSafetyStop(symbol: string, position: AlpacaPosition): Promise<boolean> {
  const qtyRaw = position.qty_available ?? position.qty;
  const qty = parseFloat(qtyRaw);
  const last = parseFloat(position.current_price);
  if (!qty || !last) return false;
  const hardStopPct = await eodHardStopPct();
  const stop = +(last * (1 - hardStopPct)).toFixed(2);
  try {
    await alpaca.placeOrder({
      symbol,
      qty,
      side: 'sell',
      type: 'stop',
      time_in_force: 'gtc',
      stop_price: stop,
    });
    await logGuardEvent('eod_flatten_restop', `GTC stop placed after failed EOD close @ ${stop}`, {
      symbol,
      qty,
      stop_price: stop,
    });
    return true;
  } catch (e) {
    console.error('[eod-flatten restop]', symbol, e);
    return false;
  }
}

function qtyAvailableForRestop(pos: AlpacaPosition): number {
  return parseFloat(pos.qty_available ?? pos.qty);
}

async function getEtfPosition(symbol: string): Promise<AlpacaPosition | undefined> {
  const positions = await alpaca.positions();
  return positions.find((p) => p.symbol === symbol);
}

export async function flattenEtfPositionAtEod(symbol: string): Promise<EodFlattenResult> {
  const cancel = await cancelSellLegsAndWait(symbol, { maxAttempts: 10, delayMs: 500 });
  if (!cancel.ready) {
    const msg = `EOD flatten ${symbol}: bracket legs still open after cancel (${cancel.remainingLegs.length})`;
    await logGuardEvent('eod_flatten_cancel_stuck', msg, {
      symbol,
      remaining: cancel.remainingLegs,
    });
    console.error('[eod-flatten]', msg);
    const pos = await getEtfPosition(symbol);
    let restopPlaced = false;
    if (pos && qtyAvailableForRestop(pos) > 0) {
      restopPlaced = await placeEodSafetyStop(symbol, pos);
    }
    return {
      ok: false,
      symbol,
      error: msg,
      cancelReady: false,
      remainingLegs: cancel.remainingLegs.length,
      restopPlaced,
    };
  }

  try {
    await retryAsync(() => alpaca.closePosition(symbol), {
      attempts: 3,
      delayMs: 400,
      backoff: 1.5,
    });
    return { ok: true, symbol };
  } catch (e) {
    const error = String(e);
    await logGuardEvent('eod_flatten_close_fail', error, { symbol, cancelledLegs: cancel.cancelled });
    console.error('[eod-flatten]', symbol, error);
    const pos = await getEtfPosition(symbol);
    let restopPlaced = false;
    if (pos && qtyAvailableForRestop(pos) > 0) {
      restopPlaced = await placeEodSafetyStop(symbol, pos);
    }
    return {
      ok: false,
      symbol,
      error,
      cancelReady: true,
      remainingLegs: 0,
      restopPlaced,
    };
  }
}
