// Open Brain write-bridge for Momentum.
// Captures lessons, weekly highlights and significant P&L events into Dusty's
// permanent memory so they surface in other contexts (recent_thoughts, weekly reviews).
//
// HTTP API (Mono API / Open Brain): POST {OPEN_BRAIN_URL}/api/brain/capture
//   body:   { content, tags, importance }
//   header: x-mono-key: {MONO_API_KEY}
//
// Fail-safe by design: a capture failure must never break a trading routine.

const BASE = process.env.OPEN_BRAIN_URL;
const KEY = process.env.MONO_API_KEY ?? '';

export function openBrainConfigured(): boolean {
  return !!BASE;
}

interface CaptureInput {
  content: string;
  importance?: 1 | 2 | 3;
  tags?: string[];
}

/**
 * Write a thought to Open Brain. Never throws. Returns true on success.
 */
export async function captureThought({ content, importance = 2, tags = [] }: CaptureInput): Promise<boolean> {
  if (!openBrainConfigured()) {
    console.warn('[openbrain] OPEN_BRAIN_URL not set, skipping capture:', content.slice(0, 80));
    return false;
  }
  try {
    const res = await fetch(`${BASE!.replace(/\/$/, '')}/api/brain/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-mono-key': KEY },
      body: JSON.stringify({ content, tags, importance }),
    });
    if (!res.ok) {
      console.error('[openbrain] capture failed:', res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error('[openbrain] capture error:', e);
    return false;
  }
}

// --- Convenience wrappers for the trader's standard event types ---

export function captureLessonEvent(lessonId: string, title: string, event: 'proposed' | 'approved' | 'rejected', detail: string) {
  const verb = event === 'proposed' ? 'voorgesteld' : event === 'approved' ? 'goedgekeurd' : 'afgewezen';
  return captureThought({
    content: `Trader-bot les ${lessonId} ${verb}: ${title}\n\n${detail}\n\n[TAG: TRADER-LESSON]`,
    importance: 2,
    tags: ['TRADER-LESSON', `TRADER-LESSON-${event.toUpperCase()}`],
  });
}

export function captureWeeklyHighlight(content: string) {
  return captureThought({
    content: `Momentum weekly review highlights:\n\n${content}\n\n[TAG: TRADER-WEEKLY]`,
    importance: 2,
    tags: ['TRADER-WEEKLY'],
  });
}

export function captureEvent(content: string) {
  return captureThought({
    content: `Momentum event:\n\n${content}\n\n[TAG: TRADER-EVENT]`,
    importance: 2,
    tags: ['TRADER-EVENT'],
  });
}
