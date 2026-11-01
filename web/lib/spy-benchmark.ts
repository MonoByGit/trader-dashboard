import { alpaca } from './alpaca';

/** Buy-and-hold SPY rendement over een datumbereik (daily bars, close-to-close). */
export async function spyBuyAndHoldReturn(
  startIso: string,
  endIso: string,
): Promise<{ startClose: number; endClose: number; returnPct: number } | null> {
  try {
    const data = await alpaca.bars(['SPY'], '1Day', 400);
    const bars = (data.bars?.SPY ?? []).slice();
    if (bars.length < 2) return null;
    const startDay = startIso.slice(0, 10);
    const endDay = endIso.slice(0, 10);
    const inRange = bars.filter((b) => {
      const d = b.t.slice(0, 10);
      return d >= startDay && d <= endDay;
    });
    if (inRange.length < 2) {
      const startBar = bars.find((b) => b.t.slice(0, 10) >= startDay) ?? bars[0];
      const endBar = [...bars].reverse().find((b) => b.t.slice(0, 10) <= endDay) ?? bars[bars.length - 1];
      const startClose = startBar.c;
      const endClose = endBar.c;
      if (!startClose) return null;
      return { startClose, endClose, returnPct: ((endClose - startClose) / startClose) * 100 };
    }
    const startClose = inRange[0].c;
    const endClose = inRange[inRange.length - 1].c;
    return { startClose, endClose, returnPct: ((endClose - startClose) / startClose) * 100 };
  } catch {
    return null;
  }
}
