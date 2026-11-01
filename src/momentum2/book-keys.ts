/** Settings-key voor een strategieboek (generiek per versie-id). */
export function bookSettingKey(versionId: string): string {
  return `m:book:${versionId}`;
}

/** Oud Momentum 2-formaat; alleen voor backwards-compatible laden. */
export function legacyBookSettingKey(versionId: string): string {
  return `m2:book:${versionId}`;
}

export function pendingSettingKey(versionId: string): string {
  return `m:pending:${versionId}`;
}

export function legacyPendingSettingKey(versionId: string): string {
  return `m2:pending:${versionId}`;
}

/** Alle boek-keys die foreignQty moet scannen. */
export const BOOK_KEY_SQL = `(key LIKE 'm:book:%' OR key LIKE 'm2:book:%')`;
