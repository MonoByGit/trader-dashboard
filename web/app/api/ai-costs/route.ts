import { NextResponse } from 'next/server';
import { dbQuery, hasDb } from '@/lib/db';
import { ensureSchema } from '@/lib/migrate';
import { sumAiCostTodayEt } from '@/lib/ai-calls';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const group = searchParams.get('group') ?? 'day';
  const routine = searchParams.get('routine');
  const decisionId = searchParams.get('decisionId');
  const assetClass = searchParams.get('asset_class');

  if (!hasDb()) {
    return NextResponse.json({ todayUsd: 0, rows: [] });
  }
  await ensureSchema();

  if (decisionId) {
    const rows = await dbQuery(
      `SELECT id, ts, routine, provider, model, input_tokens, output_tokens, cost_usd::float8 AS cost_usd, decision_id
       FROM ai_calls WHERE decision_id = $1 ORDER BY ts DESC`,
      [decisionId],
    );
    return NextResponse.json(rows);
  }

  const todayUsd = await sumAiCostTodayEt();

  if (assetClass === 'etf' || assetClass === 'crypto') {
    const rows = await dbQuery(
      `SELECT id, ts, routine, provider, model, input_tokens, output_tokens, cost_usd::float8 AS cost_usd, asset_class
       FROM ai_calls WHERE asset_class = $1 ORDER BY ts DESC LIMIT 200`,
      [assetClass],
    );
    return NextResponse.json({ todayUsd, rows });
  }

  if (routine) {
    const rows = await dbQuery(
      `SELECT id, ts, routine, provider, model, input_tokens, output_tokens, cost_usd::float8 AS cost_usd, asset_class
       FROM ai_calls WHERE routine = $1 ORDER BY ts DESC LIMIT 200`,
      [routine],
    );
    return NextResponse.json({ todayUsd, rows });
  }

  if (group === 'routine') {
    const rows = await dbQuery(
      `SELECT routine, SUM(cost_usd)::float8 AS cost_usd, SUM(input_tokens)::int AS input_tokens, SUM(output_tokens)::int AS output_tokens
       FROM ai_calls
       WHERE (ts AT TIME ZONE 'America/New_York')::date = (NOW() AT TIME ZONE 'America/New_York')::date
       GROUP BY routine ORDER BY cost_usd DESC`,
    );
    return NextResponse.json({ todayUsd, byRoutine: rows });
  }

  const rows = await dbQuery(
    `SELECT (ts AT TIME ZONE 'America/New_York')::date AS day, SUM(cost_usd)::float8 AS cost_usd
     FROM ai_calls GROUP BY day ORDER BY day DESC LIMIT 90`,
  );
  return NextResponse.json({ todayUsd, byDay: rows });
}
