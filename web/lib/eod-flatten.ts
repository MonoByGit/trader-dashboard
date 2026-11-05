import { alpaca, AlpacaPosition } from '@/lib/alpaca';
import { cancelSellLegsAndWait } from '@/lib/alpaca-orders';
import { logGuardEvent } from '@/lib/guards/service';
import { retryAsync } from '../../src/trading/eod-close-retry';
import strategy from '@/strategy.json';
import { etfClientOrderId } from '@/lib/etf-order-id';
import { m1CloseQty } from '../../src/trading/strategy-tags';
import { foreignQtyForSymbol } from '@/lib/momentum2/ownership';

export type EodFlattenResult =
  | { ok: true; symbol: string; /** 0 = niets van Momentum 1 om te sluiten (positie hoort bij een andere strategie). */ closedQty?: number }
  | { ok: false; symbol: string; error: string; cancelReady: boolean; remainingLegs: number; restopPlaced?: boolean };

async function placeEodSafetyStop(symbol: string, position: AlpacaPosition): Promise<boolean> {
  const qtyRaw = position.qty_available ?? position.qty;
  const qty = parseFloat(qtyRaw);
  const last = parseFloat(position.current_price);
  if (!qty || !last) return false;
  const hardStopPct = (strategy as { rules: { hard_stop_pct: number } }).rules.hard_stop_pct ?? 0.02;
  const stop = +(last * (1 - hardStopPct)).toFixed(2);
  try {
    await alpaca.placeOrder({
      symbol,
      qty,
      side: 'sell',
      type: 'stop',
      time_in_force: 'gtc',
      stop_price: stop,
      client_order_id: etfClientOrderId({
        routine: 'eod',
        symbol,
        side: 'sell',
        tag: 'restop',
      }),
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
    // Posities van andere strategieën (Momentum 2/3/4) blijven staan: sluit alleen het M1-deel.
    const foreign = await foreignQtyForSymbol(symbol);
    if (foreign > 0) {
      const pos = await getEtfPosition(symbol);
      const qty = m1CloseQty(pos ? parseFloat(pos.qty) : 0, foreign);
      if (qty > 0) {
        await retryAsync(
          () =>
            alpaca.placeOrder({
              symbol,
              qty,
              side: 'sell',
              type: 'market',
              time_in_force: 'day',
              client_order_id: etfClientOrderId({ routine: 'eod', symbol, side: 'sell', tag: 'partial' }),
            }),
          { attempts: 3, delayMs: 400, backoff: 1.5 },
        );
      }
      return { ok: true, symbol, closedQty: qty };
    }
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
