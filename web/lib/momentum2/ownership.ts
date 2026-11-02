import { dbQuery, hasDb } from '../db';
import { BOOK_KEY_SQL } from '../../../src/momentum2/book-keys';
import { foreignQtyFromRealBooks, uniqueBooksFromSettings } from '../../../src/momentum2/book-aggregate';
import type { VersionBook } from '../../../src/momentum2/types';

/** Alle echte strategieboeken (M2–M6) in één query. */
export async function loadRealBooks(): Promise<VersionBook[]> {
  if (!hasDb()) return [];
  const rows = await dbQuery<{ key: string; value: string }>(`SELECT key, value FROM settings WHERE ${BOOK_KEY_SQL}`);
  return uniqueBooksFromSettings(rows).filter((b) => b.real === true);
}

/**
 * Aantal stukken van `symbol` dat andere strategieën (Momentum 2–6) echt bij de broker bezitten.
 * Schaduwboeken (real != true) tellen nooit mee: die houden geen broker-posities.
 * `excludeVersionId`: het eigen boek van de vrager telt niet als 'ander'.
 */
export async function foreignQtyForSymbol(symbol: string, excludeVersionId?: string): Promise<number> {
  const books = await loadRealBooks();
  return foreignQtyFromRealBooks(
    excludeVersionId ? books.filter((b) => b.versionId !== excludeVersionId) : books,
    symbol,
  );
}
