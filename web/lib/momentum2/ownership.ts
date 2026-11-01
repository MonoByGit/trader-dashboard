import { dbQuery, hasDb } from '../db';
import { BOOK_KEY_SQL } from '../../../src/momentum2/book-keys';
import { foreignQtyFromRealBooks, uniqueBooksFromSettings } from '../../../src/momentum2/book-aggregate';

/**
 * Aantal aandelen van `symbol` dat andere strategieën (Momentum 2/3/4) echt bij de broker bezitten.
 * Schaduwboeken (real != true) tellen nooit mee: die houden geen broker-posities.
 */
export async function foreignQtyForSymbol(symbol: string): Promise<number> {
  if (!hasDb()) return 0;
  const rows = await dbQuery<{ key: string; value: string }>(`SELECT key, value FROM settings WHERE ${BOOK_KEY_SQL}`);
  return foreignQtyFromRealBooks(uniqueBooksFromSettings(rows), symbol);
}
