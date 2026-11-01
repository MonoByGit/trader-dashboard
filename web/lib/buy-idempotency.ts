import { dbQuery, hasDb, initDb } from '@/lib/db';
import type { AlpacaPosition } from '@/lib/alpaca';
import { verifyRoutineRunLock } from '@/lib/routine-runs';

export async function hasBuyDecisionTodayEt(symbol: string, routine: string): Promise<boolean> {
  return hasBuyDecisionToday(symbol, routine, 'et');
}

export async function hasBuyDecisionTodayUtc(symbol: string, routine: string): Promise<boolean> {
  return hasBuyDecisionToday(symbol, routine, 'utc');
}

async function hasBuyDecisionToday(
  symbol: string,
  routine: string,
  boundary: 'et' | 'utc',
): Promise<boolean> {
  if (!hasDb()) return false;
  await initDb();
  const day =
    boundary === 'utc'
      ? new Date().toISOString().slice(0, 10)
      : new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const tz = boundary === 'utc' ? 'UTC' : 'America/New_York';
  const rows = await dbQuery<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM decisions
     WHERE symbol = $1 AND routine = $2 AND decision = 'BUY'
       AND (ts AT TIME ZONE $4)::date = $3::date`,
    [symbol, routine, day, tz],
  );
  return rows.length ? parseInt(rows[0].c, 10) > 0 : false;
}

export function symbolHeldInPositions(positions: AlpacaPosition[], symbol: string): boolean {
  return positions.some((p) => p.symbol === symbol && parseFloat(p.qty) > 0);
}

export async function gateBuyIfLockLost(
  runId: string | undefined,
  symbol: string,
): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  if (!runId) return { allowed: true };
  const ok = await verifyRoutineRunLock(runId);
  if (!ok) {
    return { allowed: false, reason: `Run lock lost before buy (${symbol})` };
  }
  return { allowed: true };
}
