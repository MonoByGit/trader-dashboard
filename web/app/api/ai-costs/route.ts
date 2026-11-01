import { NextResponse } from 'next/server';
import { aggregateAiCostsByDay, aggregateAiCostsByWeek } from '../../../../src/ai-cost/aggregate-by-period';
import { dbQuery, hasDb } from '@/lib/db';
import { ensureSchema } from '@/lib/migrate';
import { sumAiCostTodayEt } from '@/lib/ai-calls';

const CALL_COLUMNS = `id, ts, routine, provider, model, input_tokens, output_tokens,
  finish_reason, cost_usd::float8 AS cost_usd, asset_class, decision_id`;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const group = searchParams.get('group') ?? 'day';
  const routine = searchParams.get('routine');
  const decisionId = searchParams.get('decisionId');
  const assetClass = searchParams.get('asset_class');

  if (!hasDb()) {
    return NextResponse.json({
      todayUsd: 0,
      todayByClass: { etf: 0, crypto: 0 },
      weekUsd: 0,
      weekByClass: { etf: 0, crypto: 0 },
      rows: [],
      byDay: [],
      byWeek: [],
    });
  }
  await ensureSchema();

  if (decisionId) {
    const rows = await dbQuery(
      `SELECT ${CALL_COLUMNS}
       FROM ai_calls WHERE decision_id = $1 ORDER BY ts DESC`,
      [decisionId],
    );
    return NextResponse.json(rows);
  }

  const todayUsd = await sumAiCostTodayEt();

  const todayByClassRows = await dbQuery<{ asset_class: string; cost_usd: number }>(
    `SELECT COALESCE(asset_class, 'etf') AS asset_class, SUM(cost_usd)::float8 AS cost_usd
     FROM ai_calls
     WHERE (ts AT TIME ZONE 'America/New_York')::date = (NOW() AT TIME ZONE 'America/New_York')::date
     GROUP BY COALESCE(asset_class, 'etf')`,
  );
  const todayByClass = { etf: 0, crypto: 0 };
  for (const r of todayByClassRows) {
    if (r.asset_class === 'crypto') todayByClass.crypto = r.cost_usd;
    else todayByClass.etf = r.cost_usd;
  }

  const weekByClassRows = await dbQuery<{ asset_class: string; cost_usd: number }>(
    `SELECT COALESCE(asset_class, 'etf') AS asset_class, SUM(cost_usd)::float8 AS cost_usd
     FROM ai_calls
     WHERE ts >= date_trunc('week', NOW() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York'
     GROUP BY COALESCE(asset_class, 'etf')`,
  );
  const weekByClass = { etf: 0, crypto: 0 };
  let weekUsd = 0;
  for (const r of weekByClassRows) {
    weekUsd += r.cost_usd;
    if (r.asset_class === 'crypto') weekByClass.crypto = r.cost_usd;
    else weekByClass.etf = r.cost_usd;
  }

  if (assetClass === 'etf' || assetClass === 'crypto') {
    const rows = await dbQuery(
      `SELECT ${CALL_COLUMNS}
       FROM ai_calls WHERE asset_class = $1 ORDER BY ts DESC LIMIT 200`,
      [assetClass],
    );
    return NextResponse.json({ todayUsd, todayByClass, weekUsd, weekByClass, rows });
  }

  if (routine) {
    const rows = await dbQuery(
      `SELECT ${CALL_COLUMNS}
       FROM ai_calls WHERE routine = $1 ORDER BY ts DESC LIMIT 200`,
      [routine],
    );
    return NextResponse.json({ todayUsd, todayByClass, weekUsd, weekByClass, rows });
  }

  if (group === 'routine') {
    const rows = await dbQuery(
      `SELECT routine, SUM(cost_usd)::float8 AS cost_usd, SUM(input_tokens)::int AS input_tokens, SUM(output_tokens)::int AS output_tokens
       FROM ai_calls
       WHERE (ts AT TIME ZONE 'America/New_York')::date = (NOW() AT TIME ZONE 'America/New_York')::date
       GROUP BY routine ORDER BY cost_usd DESC`,
    );
    return NextResponse.json({ todayUsd, todayByClass, weekUsd, weekByClass, byRoutine: rows });
  }

  if (group === 'week') {
    const byWeek = await dbQuery(
      `SELECT date_trunc('week', ts AT TIME ZONE 'America/New_York')::date AS week_start,
              COALESCE(asset_class, 'etf') AS asset_class,
              SUM(cost_usd)::float8 AS cost_usd
       FROM ai_calls
       GROUP BY 1, 2
       ORDER BY week_start DESC
       LIMIT 104`,
    );
    return NextResponse.json({ todayUsd, todayByClass, weekUsd, weekByClass, byWeek });
  }

  const rows = await dbQuery(
    `SELECT ${CALL_COLUMNS}
     FROM ai_calls ORDER BY ts DESC LIMIT 200`,
  );

  const byDayRaw = await dbQuery<{ day: string; asset_class: string; cost_usd: number }>(
    `SELECT (ts AT TIME ZONE 'America/New_York')::date AS day,
            COALESCE(asset_class, 'etf') AS asset_class,
            SUM(cost_usd)::float8 AS cost_usd
     FROM ai_calls
     GROUP BY day, COALESCE(asset_class, 'etf')
     ORDER BY day DESC
     LIMIT 180`,
  );

  const byDay = aggregateAiCostsByDay(byDayRaw);

  const byWeekRaw = await dbQuery<{ week_start: string; asset_class: string; cost_usd: number }>(
    `SELECT date_trunc('week', ts AT TIME ZONE 'America/New_York')::date AS week_start,
            COALESCE(asset_class, 'etf') AS asset_class,
            SUM(cost_usd)::float8 AS cost_usd
     FROM ai_calls
     GROUP BY 1, 2
     ORDER BY week_start DESC
     LIMIT 104`,
  );
  const byWeek = aggregateAiCostsByWeek(byWeekRaw);

  return NextResponse.json({
    todayUsd,
    todayByClass,
    weekUsd,
    weekByClass,
    rows,
    byDay,
    byWeek,
  });
}
