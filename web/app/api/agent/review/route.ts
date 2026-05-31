import { NextResponse } from 'next/server';
import { alpaca } from '@/lib/alpaca';
import { claudeText, claudeJson, MODELS } from '@/lib/ai';
import { dbRun, hasDb } from '@/lib/db';
import { captureWeeklyHighlight, captureLessonEvent } from '@/lib/openbrain';
import { openOrAppendThread } from '@/lib/threads';

export async function POST() {
  try {
    const [account, orders] = await Promise.all([
      alpaca.account(),
      alpaca.orders(200),
    ]);

    const equity = parseFloat(account.equity);
    const filledOrders = orders.filter(o => o.status === 'filled');

    const system = `You are Momentum. Write a weekly strategy review in Dutch for a momentum ETF trading strategy.
Be analytical. Identify what worked, what didn't, and suggest specific adjustments.
Max 4 paragraphs.`;

    const userPrompt = `Weekly review — ${new Date().toLocaleDateString('nl-NL')}
Current equity: $${equity.toFixed(2)}
Total filled orders this week: ${filledOrders.length}
Symbols traded: ${Array.from(new Set(filledOrders.map(o => o.symbol))).join(', ') || 'none'}
Open positions: ${(await alpaca.positions()).map(p => p.symbol).join(', ') || 'none'}

Write a comprehensive weekly strategy review with lessons learned and adjustments for next week.`;

    const review = await claudeText(MODELS.opus, system, userPrompt, 2048);

    // Sync the weekly highlights into Dusty's permanent memory (fail-safe).
    await captureWeeklyHighlight(review.slice(0, 1500));

    // Verankering: open een weekreview-draad (beurt -> Dusty).
    const weeklyId = `weekly-${Date.now()}`;
    await openOrAppendThread({
      title: `Weekreview ${new Date().toLocaleDateString('nl-NL')}`,
      type: 'gesprek',
      anchorType: 'report', anchorId: weeklyId,
      summary: 'Wekelijkse reflectie',
      tags: ['#weekreview'],
      body: `${review}\n\nDit is mijn reflectie op de afgelopen week. Ben je het ermee eens, of zie jij andere patronen?`,
    }).catch(() => {});

    // Lesvoorstel-generator: hoogstens 1 concrete, toetsbare les. Wordt een
    // goedkeuringsdraad; activeren gebeurt pas na Dusty's expliciete akkoord.
    try {
      const proposal = await claudeJson<{ propose: boolean; title?: string; description?: string; category?: string; confidence?: number; rationale?: string } | null>(
        MODELS.opus,
        'Je bent Momentum. Stel HOOGSTENS een concrete, toetsbare les voor die de momentum-strategie zou verbeteren, op basis van de weekreview. Wees streng: alleen voorstellen als het echt gerechtvaardigd is. Antwoord met JSON {"propose": boolean, "title": string, "description": string, "category": string, "confidence": number, "rationale": string}. Geen em-dashes.',
        `Weekreview:\n${review}\n\nVerhandelde symbolen: ${Array.from(new Set(filledOrders.map(o => o.symbol))).join(', ') || 'geen'}`,
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
          type: 'goedkeuring', priority: 'hoog',
          anchorType: 'lesson', anchorId: pid,
          summary: (proposal.description ?? 'Nieuw lesvoorstel').slice(0, 90),
          tags: ['#les', '#goedkeuring'],
          body: `Ik wil een nieuwe les voorstellen:\n\n${proposal.title}\n${proposal.description ?? ''}\n\nWaarom: ${proposal.rationale ?? ''}\n\nGoedkeuren maakt dit een actieve regel in mijn strategie. Wil je dit goedkeuren, afwijzen, of er eerst over praten?`,
        }).catch(() => {});
      }
    } catch { /* lesvoorstel niet kritisch */ }

    return NextResponse.json({
      date: new Date().toISOString().split('T')[0],
      generatedAt: new Date().toISOString(),
      equity,
      review,
      ordersThisWeek: filledOrders.length,
      symbolsTraded: Array.from(new Set(filledOrders.map(o => o.symbol))),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
