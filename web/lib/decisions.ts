import { dbRun, hasDb, initDb } from './db';
import { getActiveStrategyVersionLabel } from './strategy-versions';
import { getStrategyVersion } from './strategy-version';

export async function saveDecision(d: Record<string, unknown>): Promise<string> {
  const id = `d-${Date.now()}-${String(d.symbol)}`;
  if (!hasDb()) return id;
  await initDb();
  const strategyVersion = hasDb()
    ? await getActiveStrategyVersionLabel().catch(() => getStrategyVersion())
    : getStrategyVersion();
  await dbRun(
    `INSERT INTO decisions (id, ts, routine, symbol, decision, criteria, rationale, agent_note, confidence, order_id, strategy_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING`,
    [
      id,
      new Date().toISOString(),
      d.routine,
      d.symbol,
      d.decision,
      JSON.stringify(d.criteria ?? null),
      d.rationale,
      d.agentNote,
      d.confidence,
      d.orderId ?? null,
      strategyVersion,
    ],
  );
  return id;
}
