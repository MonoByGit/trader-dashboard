import { dbQuery, hasDb } from '../db';
import { BOOK_KEY_SQL } from '../../../src/momentum2/book-keys';
import type { VersionBook } from '../../../src/momentum2/types';

/**
 * Aantal aandelen van `symbol` dat andere strategieën (Momentum 2/3/4) echt bij de broker bezitten.
 * Schaduwboeken (real != true) tellen nooit mee: die houden geen broker-posities.
 */
export async function foreignQtyForSymbol(symbol: string): Promise<number> {
  if (!hasDb()) return 0;
  const rows = await dbQuery<{ value: string }>(`SELECT value FROM settings WHERE ${BOOK_KEY_SQL}`);
  let total = 0;
  for (const r of rows) {
    try {
      const b = JSON.parse(r.value) as VersionBook;
      if (b.real === true) total += b.positions?.[symbol]?.qty ?? 0;
    } catch {
      /* onleesbaar boek telt niet mee */
    }
  }
  return total;
}
