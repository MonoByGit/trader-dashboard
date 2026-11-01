import { NextResponse } from 'next/server';
import { alpaca } from '@/lib/alpaca';
import { dbQuery, hasDb } from '@/lib/db';
import { ensureSchema } from '@/lib/migrate';
import { loadGuardState } from '@/lib/guards/service';
import { buildHome, type HomeInput } from '../../../../src/home/build-home';

export const dynamic = 'force-dynamic';

/** Alleen lezen. Achter de app-login (middleware). Elk blok faalt voor zich en toont de fout in plaats van een leeg scherm. */
export async function GET() {
  const now = new Date().toISOString();
  const errors: string[] = [];

  let account: HomeInput['account'] = null;
  let accountError: string | undefined;
  try {
    const [a, clock] = await Promise.all([alpaca.account(), alpaca.clock()]);
    const equity = parseFloat(a.equity);
    const last = parseFloat(a.last_equity);
    account = {
      equity,
      cash: parseFloat(a.cash),
      dayPnl: equity - last,
      dayPnlPct: last ? (equity - last) / last : 0,
      marketOpen: clock.is_open,
    };
  } catch (e) {
    accountError = e instanceof Error ? e.message : String(e);
  }

  let guards: HomeInput['guards'] = null;
  try {
    const g = await loadGuardState();
    guards = { tradingEnabled: g.tradingEnabled, emergencyStop: g.emergencyStop, circuitBreakerTripped: g.circuitBreakerTripped };
  } catch (e) {
    errors.push(`guards: ${e instanceof Error ? e.message : String(e)}`);
  }

  let runs: HomeInput['runs'] = [];
  let decisions: HomeInput['decisions'] = [];
  let heartbeat: HomeInput['heartbeat'] = null;
  if (hasDb()) {
    try {
      await ensureSchema();
      runs = await dbQuery(
        `SELECT routine, status, trading_date::text AS trading_date, started_at::text AS started_at, skip_reason
         FROM routine_runs WHERE started_at > NOW() - INTERVAL '10 days' ORDER BY started_at DESC LIMIT 300`,
      );
    } catch (e) {
      errors.push(`runs: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      decisions = await dbQuery(
        `SELECT ts::text AS ts, symbol, decision, rationale, routine FROM decisions ORDER BY ts DESC LIMIT 10`,
      );
    } catch (e) {
      errors.push(`besluiten: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      const rows = await dbQuery<{ value: string }>(`SELECT value FROM settings WHERE key = 'scheduler_last_tick'`);
      heartbeat = rows[0] ? JSON.parse(rows[0].value) : null;
    } catch (e) {
      errors.push(`hartslag: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    errors.push('Geen database gekoppeld');
  }

  const home = buildHome({ now, account, accountError, guards, env: momentumEnv(process.env), runs, decisions, heartbeat });
  return NextResponse.json({ ...home, bronfouten: errors });
}

/** Alleen de Momentum-vlaggen gaan naar buildHome; geen andere omgevingswaarden. */
function momentumEnv(env: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) if (/^MOMENTUM\d+_(ENABLED|DRY_RUN)$/.test(k)) out[k] = v;
  return out;
}
