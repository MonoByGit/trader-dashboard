import { dbQuery, dbRun, hasDb, initDb } from './db';
import { agentJson } from './ai';
import { ensureSchema } from './migrate';

export type ActiveLesson = {
  id: string;
  title: string;
  description: string;
  category: string;
};

export type LessonGateResult = {
  veto: boolean;
  lessonId: string | null;
  reason: string;
  influencedLessonIds: string[];
};

export async function getActiveLessons(): Promise<ActiveLesson[]> {
  if (!hasDb()) return [];
  await ensureSchema();
  const rows = await dbQuery<{
    id: string;
    title: string;
    description: string | null;
    why: string | null;
    category: string | null;
  }>("SELECT id, title, description, why, category FROM lessons WHERE status = 'active' ORDER BY created_at ASC");
  return rows.map((l) => ({
    id: l.id,
    title: l.title,
    description: (l.description || l.why || '').trim(),
    category: l.category || 'algemeen',
  }));
}

function lessonsPromptBlock(lessons: ActiveLesson[]): string {
  if (lessons.length === 0) return '';
  return `\n\nHarde regels (goedgekeurde lessen, NO_GO als een regel schendt):\n${lessons
    .map((l, i) => `${i + 1}. [${l.id}] ${l.title}: ${l.description}`)
    .join('\n')}`;
}

/** Extra AI-check: kan een goedgekeurde les deze buy vetoën? */
export async function checkLessonsForBuy(
  symbol: string,
  reason: string,
  lessons: ActiveLesson[],
): Promise<LessonGateResult> {
  if (lessons.length === 0) {
    return { veto: false, lessonId: null, reason: '', influencedLessonIds: [] };
  }

  try {
    const verdict = await agentJson<{
      allow: boolean;
      vetoLessonId?: string | null;
      rationale?: string;
      appliedLessonIds?: string[];
    }>(
      `Je bent Momentum. Beoordeel of een geplande BUY voor ${symbol} past bij ALLE goedgekeurde lessen. Als één les duidelijk schendt: allow=false en geef vetoLessonId. appliedLessonIds = lessen die je expliciet meenam in je oordeel (ook als allow=true). Geen em-dashes.`,
      `Symbol: ${symbol}\nAgent-reden voor buy: ${reason}${lessonsPromptBlock(lessons)}\nAntwoord JSON: {"allow": boolean, "vetoLessonId": string|null, "rationale": string, "appliedLessonIds": string[]}`,
      512,
      'fast',
    );
    const applied = (verdict.appliedLessonIds ?? []).filter((id) => lessons.some((l) => l.id === id));
    if (!verdict.allow) {
      return {
        veto: true,
        lessonId: verdict.vetoLessonId && lessons.some((l) => l.id === verdict.vetoLessonId) ? verdict.vetoLessonId! : applied[0] ?? lessons[0]?.id ?? null,
        reason: verdict.rationale || 'Geblokkeerd door goedgekeurde les.',
        influencedLessonIds: applied.length ? applied : verdict.vetoLessonId ? [verdict.vetoLessonId] : [],
      };
    }
    return {
      veto: false,
      lessonId: null,
      reason: verdict.rationale || '',
      influencedLessonIds: applied,
    };
  } catch {
    return { veto: false, lessonId: null, reason: 'Lesson-check mislukt; geen veto.', influencedLessonIds: [] };
  }
}

export async function recordLessonInfluence(
  lessonIds: string[],
  decisionId: string,
  symbol: string,
  action: 'prompt' | 'veto' | 'passed_check',
): Promise<void> {
  if (!hasDb() || lessonIds.length === 0) return;
  await initDb();
  const unique = Array.from(new Set(lessonIds));
  for (const lessonId of unique) {
    const appId = `la-${Date.now()}-${lessonId.slice(-6)}`;
    await dbRun(
      `INSERT INTO lesson_applications (id, lesson_id, decision_id, symbol, action, created_at)
       VALUES ($1,$2,$3,$4,$5,NOW())`,
      [appId, lessonId, decisionId, symbol, action],
    );
    await dbRun(
      `UPDATE lessons SET hits = COALESCE(hits,0) + 1, last_applied_at = NOW() WHERE id = $1`,
      [lessonId],
    );
  }
}

/** Alle actieve lessen meenemen in market-open prompt (hard rules). */
export function marketOpenLessonsSystemSuffix(lessons: ActiveLesson[]): string {
  if (!lessons.length) return '';
  return ` Goedgekeurde lessen zijn bindend:${lessonsPromptBlock(lessons)}`;
}
