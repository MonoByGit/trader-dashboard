export type LessonAiVerdict = {
  allow?: unknown;
  vetoLessonId?: string | null;
  rationale?: string;
  appliedLessonIds?: string[];
};

/** Hard rules: only explicit boolean true allows a buy. */
export function lessonAllowsBuy(verdict: LessonAiVerdict): boolean {
  return verdict.allow === true;
}
