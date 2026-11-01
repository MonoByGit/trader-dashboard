import { dbQuery, dbRun, hasDb } from '@/lib/db';
import { ensureSchema } from '@/lib/migrate';

const KEY_ENABLED = 'crypto_module_enabled';
const KEY_DAY = 'crypto_sleeve_day_utc';
const KEY_DAY_START = 'crypto_sleeve_day_start_equity';

/** Default ON for paper experimentation. */
export async function isCryptoModuleEnabled(): Promise<boolean> {
  if (!hasDb()) return true;
  await ensureSchema();
  const rows = await dbQuery<{ value: string }>(`SELECT value FROM settings WHERE key=$1`, [KEY_ENABLED]);
  if (!rows.length) return true;
  return rows[0].value === 'true';
}

export async function setCryptoModuleEnabled(enabled: boolean): Promise<void> {
  if (!hasDb()) return;
  await ensureSchema();
  await dbRun(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
    [KEY_ENABLED, enabled ? 'true' : 'false'],
  );
}

export async function syncCryptoDayStart(sleeveEquityUsd: number, nowMs = Date.now()): Promise<number> {
  const day = new Date(nowMs).toISOString().slice(0, 10);
  if (!hasDb()) return sleeveEquityUsd;
  await ensureSchema();
  const cur = await dbQuery<{ value: string }>(`SELECT value FROM settings WHERE key=$1`, [KEY_DAY]);
  if (cur.length && cur[0].value === day) {
    const startRows = await dbQuery<{ value: string }>(`SELECT value FROM settings WHERE key=$1`, [KEY_DAY_START]);
    return startRows.length ? parseFloat(startRows[0].value) : sleeveEquityUsd;
  }
  await dbRun(
    `INSERT INTO settings (key, value) VALUES ($1, $2), ($3, $4)
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`,
    [KEY_DAY, day, KEY_DAY_START, String(sleeveEquityUsd)],
  );
  return sleeveEquityUsd;
}

export async function countCryptoBuysTodayUtc(): Promise<number> {
  if (!hasDb()) return 0;
  await ensureSchema();
  const day = new Date().toISOString().slice(0, 10);
  const rows = await dbQuery<{ c: string }>(
    `SELECT COUNT(DISTINCT symbol)::text AS c FROM decisions
     WHERE asset_class='crypto' AND decision='BUY' AND routine='crypto-scan'
       AND ts::date = $1::date`,
    [day],
  );
  return rows.length ? parseInt(rows[0].c, 10) : 0;
}
