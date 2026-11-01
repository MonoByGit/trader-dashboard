export type OrderFillSnapshot = { status: string; filled_qty: string };

export type PositionQtySnapshot = {
  symbol: string;
  qty: string;
  qty_available?: string;
};

export const DEFAULT_BUY_FILL_POLL_DELAY_MS = 250;

export async function pollOrderFilledQty(
  orderId: string,
  getOrder: (id: string) => Promise<OrderFillSnapshot>,
  options?: { attempts?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> },
): Promise<void> {
  const attempts = options?.attempts ?? 24;
  const delayMs = options?.delayMs ?? DEFAULT_BUY_FILL_POLL_DELAY_MS;
  const sleep = options?.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  for (let i = 0; i < attempts; i++) {
    const order = await getOrder(orderId);
    if (order.status === 'filled') return;
    if (['canceled', 'expired', 'rejected'].includes(order.status)) {
      throw new Error(`Order ${orderId} ended as ${order.status}`);
    }
    if (i < attempts - 1) await sleep(delayMs);
  }
  throw new Error(`Order ${orderId} not filled after ${attempts} polls`);
}

export function positionQtyAvailable(pos: PositionQtySnapshot): number {
  const available = pos.qty_available ?? pos.qty;
  return parseFloat(available);
}

export async function resolveCryptoPositionSellQty(
  symbol: string,
  orderId: string,
  deps: {
    getOrder: (id: string) => Promise<OrderFillSnapshot>;
    positions: () => Promise<PositionQtySnapshot[]>;
    symbolsEqual: (a: string, b: string) => boolean;
    poll?: typeof pollOrderFilledQty;
    pollOptions?: { attempts?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> };
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<number> {
  const poll = deps.poll ?? pollOrderFilledQty;
  const pollOptions = {
    attempts: 24,
    delayMs: DEFAULT_BUY_FILL_POLL_DELAY_MS,
    sleep: deps.sleep,
    ...deps.pollOptions,
  };
  await poll(orderId, deps.getOrder, pollOptions);

  const positions = await deps.positions();
  const pos = positions.find((p) => deps.symbolsEqual(p.symbol, symbol));
  if (!pos) throw new Error(`No position for ${symbol} after buy ${orderId}`);
  const qty = positionQtyAvailable(pos);
  if (!(qty > 0)) throw new Error(`Zero qty for ${symbol} after buy ${orderId}`);
  return qty;
}
