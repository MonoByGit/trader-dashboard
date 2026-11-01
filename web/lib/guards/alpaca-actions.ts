import { isCryptoSymbol } from '@/lib/asset-class';
import { alpaca } from '@/lib/alpaca';
import { exitCryptoPosition } from '@/lib/crypto/exit-crypto-position';
async function waitForNoOpenOrders(attempts = 12, delayMs = 250): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    const open = await alpaca.openOrders(200);
    if (!open.length) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

/** Cancel all open orders, then close every position (paper only). */
export async function flattenAllPositions(): Promise<{ closed: string[]; errors: string[] }> {
  const closed: string[] = [];
  const errors: string[] = [];

  try {
    await alpaca.cancelAllOrders();
    const cleared = await waitForNoOpenOrders();
    if (!cleared) {
      errors.push('cancel orders: open orders remain after cancelAll (timeout)');
    }
  } catch (e) {
    errors.push(`cancel orders: ${String(e)}`);
  }

  const positions = await alpaca.positions();
  for (const p of positions) {
    try {
      if (isCryptoSymbol(p.symbol) || p.asset_class === 'crypto') {
        const result = await exitCryptoPosition(p.symbol, 'emergency_flatten', {
          mode: 'close_position',
        });
        if (result.exited || result.skippedReason === 'no_qty' || result.skippedReason === 'broker_filled') {
          closed.push(p.symbol);
        } else if (result.skippedReason) {
          errors.push(`${p.symbol}: exit skipped (${result.skippedReason})`);
        }
      } else {
        await alpaca.closePosition(p.symbol);
        closed.push(p.symbol);
      }
    } catch (e) {
      errors.push(`${p.symbol}: ${String(e)}`);
    }
  }

  return { closed, errors };
}
