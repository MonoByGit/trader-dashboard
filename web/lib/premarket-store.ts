import { dbQuery, hasDb, initDb } from '@/lib/db';
import { tradingDateEt } from '@scheduler/decide';
import type { PremarketDecisionRow } from '../../src/strategy/market-open-premarket';

export async function loadPremarketDecisionsForTradingDate(
  tradingDate?: string,
): Promise<PremarketDecisionRow[]> {
  if (!hasDb()) return [];
  await initDb();
  const day = tradingDate ?? tradingDateEt(Date.now());
  const rows = await dbQuery<{
    symbol: string;
    decision: string;
    criteria: Record<string, unknown> | null;
  }>(
    `SELECT symbol, decision, criteria FROM decisions
     WHERE routine = 'premarket'
       AND (ts AT TIME ZONE 'America/New_York')::date = $1::date
     ORDER BY ts DESC`,
    [day],
  );
  const bySymbol = new Map<string, PremarketDecisionRow>();
  for (const r of rows) {
    if (r.symbol === '—' || !r.symbol) continue;
    if (!bySymbol.has(r.symbol)) {
      bySymbol.set(r.symbol, {
        symbol: r.symbol,
        decision: r.decision,
        criteria: r.criteria ?? undefined,
      });
    }
  }
  return Array.from(bySymbol.values());
}
