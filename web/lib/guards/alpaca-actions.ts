import { alpaca } from '@/lib/alpaca';

/** Cancel all open orders, then close every position (paper only). */
export async function flattenAllPositions(): Promise<{ closed: string[]; errors: string[] }> {
  const closed: string[] = [];
  const errors: string[] = [];

  try {
    await alpaca.cancelAllOrders();
  } catch (e) {
    errors.push(`cancel orders: ${String(e)}`);
  }

  const positions = await alpaca.positions();
  for (const p of positions) {
    try {
      await alpaca.closePosition(p.symbol);
      closed.push(p.symbol);
    } catch (e) {
      errors.push(`${p.symbol}: ${String(e)}`);
    }
  }

  return { closed, errors };
}
