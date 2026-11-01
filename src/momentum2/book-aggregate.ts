import type { VersionBook } from './types';

export function versionIdFromBookSettingsKey(key: string): string | null {
  if (key.startsWith('m:book:')) return key.slice('m:book:'.length);
  if (key.startsWith('m2:book:')) return key.slice('m2:book:'.length);
  return null;
}

/** Eén boek per versionId; `m:book:` wint op `m2:book:` (geen dubbele foreignQty). */
export function uniqueBooksFromSettings(rows: Array<{ key: string; value: string }>): VersionBook[] {
  const best = new Map<string, { book: VersionBook; rank: number }>();
  for (const r of rows) {
    const vid = versionIdFromBookSettingsKey(r.key);
    if (!vid) continue;
    try {
      const book = JSON.parse(r.value) as VersionBook;
      const id = book.versionId || vid;
      const rank = r.key.startsWith('m:book:') ? 2 : 1;
      const cur = best.get(id);
      if (!cur || rank > cur.rank) best.set(id, { book, rank });
    } catch {
      /* onleesbaar */
    }
  }
  return Array.from(best.values(), (x) => x.book);
}

export function foreignQtyFromRealBooks(books: VersionBook[], symbol: string): number {
  let total = 0;
  for (const b of books) {
    if (b.real === true) total += b.positions?.[symbol]?.qty ?? 0;
  }
  return total;
}
