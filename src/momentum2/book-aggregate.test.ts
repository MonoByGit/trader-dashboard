import { foreignQtyFromRealBooks, uniqueBooksFromSettings } from './book-aggregate';
import type { VersionBook } from './types';

const realBook = (versionId: string, symbol: string, qty: number): VersionBook => ({
  versionId,
  startDate: null,
  startBudgetUsd: 10_000,
  startSpyPrice: 100,
  cash: 0,
  positions: { [symbol]: { qty, entryPrice: 1, entryDate: '2024-01-01', highWater: 1 } },
  peakEquity: 10_000,
  halted: false,
  haltReason: null,
  lastRebalanceIndex: null,
  real: true,
});

describe('uniqueBooksFromSettings', () => {
  it('telt legacy + m:book niet dubbel (Dave repro: 25 i.p.v. 20)', () => {
    const id = 'm5-nasdaq-trend';
    const rows = [
      { key: `m2:book:${id}`, value: JSON.stringify(realBook(id, 'QQQ', 10)) },
      { key: `m:book:${id}`, value: JSON.stringify(realBook(id, 'QQQ', 25)) },
    ];
    const books = uniqueBooksFromSettings(rows);
    expect(books).toHaveLength(1);
    expect(foreignQtyFromRealBooks(books, 'QQQ')).toBe(25);
  });
});
