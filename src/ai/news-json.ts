/** Parse Gemini news JSON safely; truncated or invalid output becomes {}. */
export function safeNewsJsonFromText(raw: string, finishReason?: string | null): string {
  if (finishReason === 'MAX_TOKENS' || finishReason === 'length') {
    return '{}';
  }
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return '{}';
  try {
    JSON.parse(m[0]);
    return m[0];
  } catch {
    return '{}';
  }
}
