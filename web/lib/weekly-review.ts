import { alpaca } from './alpaca';
import { claudeText, claudeJson, MODELS } from './ai';
import { dbQuery, dbRun, hasDb, initDb } from './db';
import { captureWeeklyHighlight, captureLessonEvent } from './openbrain';
import { openOrAppendThread } from './threads';
import { ensureSchema } from './migrate';
import { spyBuyAndHoldReturn } from './spy-benchmark';
import { listReports } from './reports';
import { attachStrategyBacktestToProposal } from './lesson-strategy-loop';

export async function runWeeklyReview() {
  const [account, orders] = await Promise.all([
    alpaca.account(),
    alpaca.orders(200),
  ]);

  const equity = parseFloat(account.equity);
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const weekAgoIso = weekAgo.toISOString();
  const nowIso = new Date().toISOString();

  const filledOrders = orders.filter((o) => o.status === 'filled' && o.filled_at && o.filled_at >= weekAgoIso);

  let postMortemsBlock = 'Geen post-mortems in database.';
  let decisionsBlock = 'Geen beslissingen in database.';
  let reportsBlock = 'Geen dagrapporten in database.';
  let weekPnl = 0;

  if (hasDb()) {
    await ensureSchema();
    await initDb();

    const pms = await dbQuery<{
      symbol: string;
      entry_price: number;
      exit_price: number;
      realized_pnl: number;
      close_reason: string;
      learn_note: string | null;
      closed_at: string;
    }>(
      `SELECT symbol, entry_price, exit_price, realized_pnl, close_reason, learn_note, closed_at
       FROM trade_post_mortems WHERE closed_at >= $1 ORDER BY closed_at ASC`,
      [weekAgoIso],
    );
    weekPnl = pms.reduce((s, t) => s + t.realized_pnl, 0);
    postMortemsBlock = pms.length
      ? pms
          .map(
            (t) =>
              `- ${t.symbol}: $${t.entry_price.toFixed(2)}→$${t.exit_price.toFixed(2)}, P&L $${t.realized_pnl.toFixed(2)} (${t.close_reason}). ${t.learn_note ?? ''}`,
          )
          .join('\n')
      : 'Geen gesloten trades deze week.';

    const decs = await dbQuery<{ ts: string | Date; symbol: string; decision: string; rationale: string | null }>(
      `SELECT ts, symbol, decision, rationale FROM decisions WHERE ts >= $1 ORDER BY ts ASC LIMIT 80`,
      [weekAgoIso],
    );
    decisionsBlock = decs.length
      ? decs
          .map((d) => {
            const ts = (d.ts instanceof Date ? d.ts.toISOString() : String(d.ts ?? '')).slice(0, 16);
            return `- ${ts} ${d.symbol} ${d.decision}: ${d.rationale ?? ''}`;
          })
          .join('\n')
      : 'Geen beslissingen deze week.';

    const reports = (await listReports(7)).filter((r) => r.generatedAt >= weekAgoIso);
    reportsBlock = reports.length
      ? reports.map((r) => `### ${r.date}\nP&L ${r.kpis.sessionPnl.toFixed(2)} (${r.kpis.sessionPnlPct.toFixed(2)}%)\n${r.summary.slice(0, 800)}`).join('\n\n')
      : 'Geen EOD-rapporten deze week.';
  }

  const spy = await spyBuyAndHoldReturn(weekAgoIso, nowIso);
  const spyLine = spy
    ? `SPY buy-and-hold (${weekAgo.toLocaleDateString('nl-NL')} t/m vandaag): ${spy.returnPct >= 0 ? '+' : ''}${spy.returnPct.toFixed(2)}% ($${spy.startClose.toFixed(2)} → $${spy.endClose.toFixed(2)}).`
    : 'SPY benchmark niet beschikbaar.';

  const system = `You are Momentum. Write a weekly strategy review in Dutch for a momentum ETF paper trading strategy.
Be analytical. Identify what worked, what didn't, and suggest specific adjustments.
Compare our week to SPY buy-and-hold when data is given.
Max 4 paragraphs. No em-dashes.`;

  const userPrompt = `Weekly review — ${new Date().toLocaleDateString('nl-NL')}
Current equity: $${equity.toFixed(2)}
Realized P&L from closed trades this week (post-mortems): $${weekPnl.toFixed(2)}
Total filled orders this week: ${filledOrders.length}
Symbols traded: ${Array.from(new Set(filledOrders.map((o) => o.symbol))).join(', ') || 'none'}
Open positions: ${(await alpaca.positions()).map((p) => p.symbol).join(', ') || 'none'}

${spyLine}

## Post-mortems (gesloten trades)
${postMortemsBlock}

## Beslissingen
${decisionsBlock}

## Dagrapporten (EOD)
${reportsBlock}

Write a comprehensive weekly strategy review with lessons learned and adjustments for next week.`;

  const review = await claudeText(MODELS.opus, system, userPrompt, 2048);

  await captureWeeklyHighlight(review.slice(0, 1500));

  const weeklyId = `weekly-${Date.now()}`;
  await openOrAppendThread({
    title: `Weekreview ${new Date().toLocaleDateString('nl-NL')}`,
    type: 'gesprek',
    anchorType: 'report',
    anchorId: weeklyId,
    summary: 'Wekelijkse reflectie',
    tags: ['#weekreview'],
    body: `${review}\n\nDit is mijn reflectie op de afgelopen week. Ben je het ermee eens, of zie jij andere patronen?`,
  }).catch(() => {});

  try {
    const proposal = await claudeJson<{
      propose: boolean;
      title?: string;
      description?: string;
      category?: string;
      confidence?: number;
      rationale?: string;
      rulesPatch?: Record<string, number>;
    } | null>(
      MODELS.opus,
      'Je bent Momentum. Stel HOOGSTENS een concrete, toetsbare les voor die de momentum-strategie zou verbeteren, op basis van de weekreview en de post-mortems. Wees streng: alleen voorstellen als het echt gerechtvaardigd is. Antwoord met JSON {"propose": boolean, "title": string, "description": string, "category": string, "confidence": number, "rationale": string}. Geen em-dashes.',
      `Weekreview:\n${review}\n\nPost-mortems:\n${postMortemsBlock}\n\n${spyLine}`,
    );
    if (proposal && proposal.propose && proposal.title && hasDb()) {
      const pid = `lp-${Date.now()}`;
      await dbRun(
        `INSERT INTO lesson_proposals (id, title, description, category, status, confidence, rationale, proposed_at)
         VALUES ($1,$2,$3,$4,'proposed',$5,$6,NOW()) ON CONFLICT (id) DO NOTHING`,
        [pid, proposal.title, proposal.description ?? '', proposal.category ?? 'algemeen', proposal.confidence ?? null, proposal.rationale ?? ''],
      );
      await captureLessonEvent(pid, proposal.title, 'proposed', proposal.description ?? '');
      await openOrAppendThread({
        title: `Lesvoorstel: ${proposal.title}`,
        type: 'goedkeuring',
        priority: 'hoog',
        anchorType: 'lesson',
        anchorId: pid,
        summary: (proposal.description ?? 'Nieuw lesvoorstel').slice(0, 90),
        tags: ['#les', '#goedkeuring'],
        body: `Ik wil een nieuwe les voorstellen:\n\n${proposal.title}\n${proposal.description ?? ''}\n\nWaarom: ${proposal.rationale ?? ''}\n\nGoedkeuren maakt dit een actieve regel in mijn strategie. Wil je dit goedkeuren, afwijzen, of er eerst over praten?`,
      }).catch(() => {});

      await attachStrategyBacktestToProposal({
        proposalId: pid,
        title: proposal.title,
        description: proposal.description ?? '',
        rulesPatch: proposal.rulesPatch as import('../../src/strategy/content').StrategyRulesPatch | undefined,
      });
    }
  } catch {
    /* lesvoorstel niet kritisch */
  }

  return {
    date: new Date().toISOString().split('T')[0],
    generatedAt: new Date().toISOString(),
    equity,
    review,
    weekRealizedPnl: weekPnl,
    spyBenchmark: spy,
    ordersThisWeek: filledOrders.length,
    symbolsTraded: Array.from(new Set(filledOrders.map((o) => o.symbol))),
  };
}
