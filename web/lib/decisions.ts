import { classifySymbol, type AssetClassId } from '@/lib/asset-class';
import { dbRun, hasDb, initDb } from './db';
import { getActiveStrategyVersionLabel } from './strategy-versions';
import { getStrategyVersion } from './strategy-version';
import { getActiveCryptoStrategyVersionLabel } from './crypto/strategy-version';

export async function saveDecision(d: Record<string, unknown>): Promise<string> {
  const id = `d-${Date.now()}-${String(d.symbol)}`;
  if (!hasDb()) return id;
  await initDb();
  const symbol = String(d.symbol);
  const assetClass =
    (d.asset_class as AssetClassId | undefined) ?? classifySymbol(symbol);

  let strategyVersion: string;
  if (assetClass === 'crypto') {
    strategyVersion = await getActiveCryptoStrategyVersionLabel().catch(() =>
      getStrategyVersion(),
    );
  } else {
    strategyVersion = await getActiveStrategyVersionLabel().catch(() => getStrategyVersion());
  }

  await dbRun(
    `INSERT INTO decisions (id, ts, routine, symbol, decision, criteria, rationale, agent_note, confidence, order_id, strategy_version, asset_class)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO NOTHING`,
    [
      id,
      new Date().toISOString(),
      d.routine,
      symbol,
      d.decision,
      JSON.stringify(d.criteria ?? null),
      d.rationale,
      d.agentNote,
      d.confidence,
      d.orderId ?? null,
      strategyVersion,
      assetClass,
    ],
  );
  return id;
}
