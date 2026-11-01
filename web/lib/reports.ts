import { alpacaSymbolsEqual } from '../../src/alpaca/symbol-path';
import { pgDateToYmd, pgTimestampToHm, pgTimestampToIso } from '../../src/dates/pg';
import { dbQuery, hasDb, initDb } from './db';
import { ensureSchema } from './migrate';

export type ApiReport = {
  id: string;
  date: string;
  label: string;
  status: string;
  generatedAt: string;
  kpis: {
    sessionPnl: number;
    sessionPnlPct: number;
    equityStart: number;
    equityEnd: number;
    tradesOpened: number;
    tradesClosed: number;
    winRate: number | null;
    avgR: number | null;
    maxDrawdown: number;
  };
  summary: string;
  trades: {
    id: string;
    symbol: string;
    side: string;
    qty: number;
    entry: number;
    exit: number | null;
    pnl: number;
    pnlPct: number;
    r: number | null;
    time: string;
    status: string;
    note?: string;
  }[];
  lessonsApplied: { id: string; title: string; hits: number; outcome: string }[];
  lessonsLearned: { id: string; title: string; status: string; why: string }[];
  gates: { label: string; state: string; note: string }[];
  riskEvents: { time: string; text: string; kind: string }[];
};

function dateLabel(isoDate: string): string {
  try {
    const d = new Date(`${isoDate}T12:00:00`);
    return d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return isoDate;
  }
}

export async function listReports(limit = 30): Promise<ApiReport[]> {
  if (!hasDb()) return [];
  await ensureSchema();
  await initDb();
  const rows = await dbQuery<{
    id: string;
    date: string;
    generated_at: string;
    kpis: Record<string, unknown> | null;
    narrative: string | null;
    status: string | null;
  }>(`SELECT id, date, generated_at, kpis, narrative, status FROM agent_reports ORDER BY generated_at DESC LIMIT $1`, [limit]);

  const out: ApiReport[] = [];
  for (const r of rows) {
    out.push(await enrichReportRow(r));
  }
  return out;
}

async function enrichReportRow(r: {
  id: string;
  date: string;
  generated_at: string;
  kpis: Record<string, unknown> | null;
  narrative: string | null;
  status: string | null;
}): Promise<ApiReport> {
  const kp = r.kpis ?? {};
  const equityStart = Number(kp.equityStart ?? kp.equity_start ?? 0);
  const equityEnd = Number(kp.equityEnd ?? kp.equity_end ?? 0);
  const sessionPnl = equityEnd - equityStart;
  const sessionPnlPct = equityStart ? (sessionPnl / equityStart) * 100 : 0;

  const reportDate = pgDateToYmd(r.date);
  const dayStart = `${reportDate}T00:00:00.000Z`;
  const dayEnd = `${reportDate}T23:59:59.999Z`;

  const decisions = await dbQuery<{
    id: string;
    ts: string;
    symbol: string;
    decision: string;
    rationale: string | null;
    agent_note: string | null;
  }>(
    `SELECT id, ts, symbol, decision, rationale, agent_note FROM decisions
     WHERE ts >= $1::timestamptz AND ts <= $2::timestamptz ORDER BY ts ASC`,
    [dayStart, dayEnd],
  );

  const postMortems = await dbQuery<{
    id: string;
    symbol: string;
    qty: number;
    entry_price: number;
    exit_price: number;
    realized_pnl: number;
    learn_note: string | null;
    close_reason: string;
    closed_at: string;
  }>(
    `SELECT id, symbol, qty, entry_price, exit_price, realized_pnl, learn_note, close_reason, closed_at
     FROM trade_post_mortems WHERE closed_at >= $1::timestamptz AND closed_at <= $2::timestamptz`,
    [dayStart, dayEnd],
  );

  const lessonApps = await dbQuery<{
    lesson_id: string;
    title: string;
    hits: number;
    action: string;
    symbol: string;
  }>(
    `SELECT la.lesson_id, l.title, l.hits, la.action, la.symbol
     FROM lesson_applications la
     JOIN lessons l ON l.id = la.lesson_id
     WHERE la.created_at >= $1::timestamptz AND la.created_at <= $2::timestamptz`,
    [dayStart, dayEnd],
  );

  const proposals = await dbQuery<{ id: string; title: string; status: string; rationale: string | null }>(
    `SELECT id, title, status, rationale FROM lesson_proposals
     WHERE proposed_at >= $1::timestamptz AND proposed_at <= $2::timestamptz AND status IN ('proposed','approved')`,
    [dayStart, dayEnd],
  );

  const buys = decisions.filter((d) => d.decision === 'BUY');
  const closes = decisions.filter((d) => d.decision === 'CLOSE');
  const closedPm = postMortems;
  const winCount = closedPm.filter((t) => t.realized_pnl > 0).length;
  const winRate = closedPm.length ? winCount / closedPm.length : null;

  const trades = [
    ...postMortems.map((t) => ({
      id: t.id,
      symbol: t.symbol,
      side: 'BUY',
      qty: t.qty,
      entry: t.entry_price,
      exit: t.exit_price,
      pnl: t.realized_pnl,
      pnlPct: t.entry_price ? ((t.exit_price - t.entry_price) / t.entry_price) * 100 : 0,
      r: null as number | null,
      time: pgTimestampToIso(t.closed_at) ?? '',
      status: 'closed',
      note: t.learn_note ?? t.close_reason,
    })),
    ...buys
      .filter((b) => !postMortems.some((p) => alpacaSymbolsEqual(p.symbol, b.symbol)))
      .map((b) => ({
        id: b.id,
        symbol: b.symbol,
        side: 'BUY',
        qty: 0,
        entry: 0,
        exit: null,
        pnl: 0,
        pnlPct: 0,
        r: null,
        time: pgTimestampToIso(b.ts) ?? '',
        status: 'open',
        note: b.rationale ?? undefined,
      })),
  ];

  const riskEvents = closes.map((c) => ({
    time: pgTimestampToHm(c.ts),
    kind: 'info',
    text: `${c.symbol}: ${c.rationale ?? 'gesloten'}`,
  }));

  return {
    id: r.id,
    date: reportDate,
    label: dateLabel(reportDate),
    status: r.status ?? 'final',
    generatedAt: pgTimestampToIso(r.generated_at) ?? '',
    kpis: {
      sessionPnl,
      sessionPnlPct,
      equityStart,
      equityEnd,
      tradesOpened: buys.length,
      tradesClosed: closedPm.length || closes.length,
      winRate,
      avgR: null,
      maxDrawdown: Number(kp.maxDrawdown ?? 0),
    },
    summary: r.narrative ?? '',
    trades,
    lessonsApplied: lessonApps.map((la) => ({
      id: la.lesson_id,
      title: la.title,
      hits: la.hits ?? 0,
      outcome: `${la.action} · ${la.symbol}`,
    })),
    lessonsLearned: proposals.map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      why: p.rationale ?? '',
    })),
    gates: [],
    riskEvents,
  };
}
