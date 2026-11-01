export type OrderFillSnapshot = { status: string; filled_qty: string };

export async function pollOrderFilledQty(
  orderId: string,
  getOrder: (id: string) => Promise<OrderFillSnapshot>,
  options?: { attempts?: number; delayMs?: number },
): Promise<number> {
  const attempts = options?.attempts ?? 12;
  const delayMs = options?.delayMs ?? 0;

  for (let i = 0; i < attempts; i++) {
    const order = await getOrder(orderId);
    if (order.status === 'filled') {
      const qty = parseFloat(order.filled_qty);
      if (qty > 0) return qty;
    }
    if (order.status === 'partially_filled') {
      const qty = parseFloat(order.filled_qty);
      if (qty > 0) return qty;
    }
    if (['canceled', 'expired', 'rejected'].includes(order.status)) {
      throw new Error(`Order ${orderId} ended as ${order.status}`);
    }
    if (delayMs > 0 && i < attempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(`Order ${orderId} not filled after ${attempts} polls`);
}

export async function resolveCryptoPositionSellQty(
  symbol: string,
  orderId: string,
  deps: {
    getOrder: (id: string) => Promise<OrderFillSnapshot>;
    positions: () => Promise<{ symbol: string; qty: string }[]>;
    symbolsEqual: (a: string, b: string) => boolean;
    poll?: typeof pollOrderFilledQty;
  },
): Promise<number> {
  const poll = deps.poll ?? pollOrderFilledQty;
  try {
    return await poll(orderId, deps.getOrder, { attempts: 12, delayMs: 0 });
  } catch {
    const positions = await deps.positions();
    const pos = positions.find((p) => deps.symbolsEqual(p.symbol, symbol));
    if (!pos) throw new Error(`No position for ${symbol} after buy ${orderId}`);
    const qty = parseFloat(pos.qty);
    if (!(qty > 0)) throw new Error(`Zero qty for ${symbol} after buy ${orderId}`);
    return qty;
  }
}
