/** @jest-environment node */
import { jest } from '@jest/globals';

const settings = new Map<string, string>();

jest.unstable_mockModule('@/lib/db', () => ({
  hasDb: () => true,
  dbQuery: async (sql: string, params?: unknown[]) => {
    if (sql.includes('SELECT value FROM settings WHERE key')) {
      const key = params?.[0] as string;
      const v = settings.get(key);
      return v ? [{ value: v }] : [];
    }
    return [];
  },
  dbRun: async (sql: string) => {
    if (sql.includes('CREATE TABLE')) return;
  },
  dbTransaction: async (run: (q: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>) => Promise<unknown>) => {
    await run(async (sql, params) => {
      if (sql.includes('INSERT INTO settings') && sql.includes('ON CONFLICT')) {
        settings.set(params![0] as string, params![1] as string);
      }
      if (sql.startsWith('DELETE FROM settings')) {
        settings.delete(params![0] as string);
      }
      return { rows: [], rowCount: 0 };
    });
  },
}));

const { postgresStore } = await import('./store');

describe('postgresStore saveBook', () => {
  it('verwijdert legacy m2:book bij save naar m:book', async () => {
    settings.clear();
    settings.set('m2:book:v1', JSON.stringify({ versionId: 'v1', cash: 1 }));
    const store = postgresStore();
    await store.saveBook({
      versionId: 'v1',
      startDate: null,
      startBudgetUsd: 100,
      startSpyPrice: null,
      cash: 100,
      positions: {},
      peakEquity: 100,
      halted: false,
      haltReason: null,
      lastRebalanceIndex: null,
    });
    expect(settings.has('m:book:v1')).toBe(true);
    expect(settings.has('m2:book:v1')).toBe(false);
  });
});
