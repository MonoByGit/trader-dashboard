export function planSoftwareTakeProfitAction(input: {
  lastPrice: number;
  takeProfitPrice: number;
  openStopLimitSell: boolean;
}): { action: 'exit_via_helper' } | { action: 'none' } {
  if (input.lastPrice < input.takeProfitPrice) return { action: 'none' };
  // Single exit path (PR 29 exitCryptoPosition); never a second broker sell alongside stop-limit.
  void input.openStopLimitSell;
  return { action: 'exit_via_helper' };
}

export type SoftwareTakeProfitExit = (
  symbol: string,
  reason: string,
) => Promise<{ orderId?: string }>;

/** Software-only TP: at most one sell via shared exit helper (no broker TP limit). */
export async function runSoftwareTakeProfitExit(input: {
  symbol: string;
  lastPrice: number;
  takeProfitPrice: number;
  openStopLimitSell: boolean;
  exit: SoftwareTakeProfitExit;
  logEvent: (reason: string) => Promise<void>;
}): Promise<{ triggered: boolean; orderId?: string }> {
  const plan = planSoftwareTakeProfitAction({
    lastPrice: input.lastPrice,
    takeProfitPrice: input.takeProfitPrice,
    openStopLimitSell: input.openStopLimitSell,
  });
  if (plan.action === 'none') return { triggered: false };
  await input.logEvent(`Price ${input.lastPrice} >= TP ${input.takeProfitPrice}`);
  const result = await input.exit(input.symbol, `software_take_profit ${input.takeProfitPrice}`);
  return { triggered: true, orderId: result.orderId };
}
