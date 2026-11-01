import { dbQuery, dbRun, dbTransaction, hasDb } from '../db';
import {
  bookSettingKey,
  legacyBookSettingKey,
  legacyPendingSettingKey,
  pendingSettingKey,
} from '../../../src/momentum2/book-keys';
import type { DecisionRecord, Store } from '../../../src/momentum2/live';
import type { EquityLogRow, OrderIntent, TradeLogRow, VersionBook } from '../../../src/momentum2/types';

let ready: Promise<void> | null = null;
function ensure(): Promise<void> {
  ready ??= dbRun(`
    CREATE TABLE IF NOT EXISTS momentum2_log (
      id BIGSERIAL PRIMARY KEY,
      version_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      day DATE,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  return ready;
}

async function getSetting<T>(key: string): Promise<T | null> {
  const rows = await dbQuery<{ value: string }>(`SELECT value FROM settings WHERE key = $1`, [key]);
  return rows[0] ? (JSON.parse(rows[0].value) as T) : null;
}

async function upsertDropLegacy(key: string, legacyKey: string, value: unknown): Promise<void> {
  const payload = JSON.stringify(value);
  await dbTransaction(async (query) => {
    await query(
      `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, payload],
    );
    await query(`DELETE FROM settings WHERE key = $1`, [legacyKey]);
    return undefined;
  });
}

async function log(versionId: string, kind: string, day: string, payload: unknown): Promise<void> {
  await dbRun(`INSERT INTO momentum2_log (version_id, kind, day, payload) VALUES ($1,$2,$3,$4)`, [
    versionId, kind, day, JSON.stringify(payload),
  ]);
}

async function loadBookId(id: string): Promise<VersionBook | null> {
  return (await getSetting<VersionBook>(bookSettingKey(id))) ?? (await getSetting<VersionBook>(legacyBookSettingKey(id)));
}

async function loadPendingId(id: string): Promise<OrderIntent[]> {
  return (
    (await getSetting<OrderIntent[]>(pendingSettingKey(id))) ??
    (await getSetting<OrderIntent[]>(legacyPendingSettingKey(id))) ??
    []
  );
}

/** Boeken en logs staan in Postgres (settings + momentum2_log). Zonder database: geen opslag, dus de route weigert te draaien. */
export function postgresStore(): Store {
  if (!hasDb()) throw new Error('momentum2 vereist DATABASE_URL');
  return {
    loadBook: async (id) => { await ensure(); return loadBookId(id); },
    saveBook: async (b) => {
      await ensure();
      await upsertDropLegacy(bookSettingKey(b.versionId), legacyBookSettingKey(b.versionId), b);
    },
    loadPending: async (id) => loadPendingId(id),
    savePending: async (id, o) => {
      await upsertDropLegacy(pendingSettingKey(id), legacyPendingSettingKey(id), o);
    },
    logEquity: async (id, r: EquityLogRow) => { await ensure(); await log(id, 'equity', r.date, r); },
    logTrade: async (id, r: TradeLogRow) => { await ensure(); await log(id, 'trade', r.date, r); },
    logDecision: async (r: DecisionRecord) => { await ensure(); await log(r.versionId, `decision:${r.kind}`, r.date, r); },
  };
}
