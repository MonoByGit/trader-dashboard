import { dbQuery, dbRun, hasDb, initDb } from '@/lib/db';

const DAY_KEY = 'crypto_guard_day_utc';
const DAY_START_KEY = 'crypto_guard_day_start_equity';

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Tracks crypto book value at UTC day boundary for crypto-specific daily loss limit. */
export async function syncCryptoDayStart(cryptoBookValueUsd: number): Promise<number> {
  const day = utcDay();
  if (!hasDb()) return cryptoBookValueUsd;
  await initDb();
  const storedDay = await dbQuery<{ value: string }>(`SELECT value FROM settings WHERE key=$1`, [DAY_KEY]);
  if (!storedDay.length || storedDay[0].value !== day) {
    await dbRun(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value=$2`,
      [DAY_KEY, day],
    );
    await dbRun(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value=$2`,
      [DAY_START_KEY, String(cryptoBookValueUsd)],
    );
    return cryptoBookValueUsd;
  }
  const startRows = await dbQuery<{ value: string }>(`SELECT value FROM settings WHERE key=$1`, [DAY_START_KEY]);
  return startRows.length ? parseFloat(startRows[0].value) : cryptoBookValueUsd;
}

export async function countCryptoEntriesTodayUtc(): Promise<number> {
  if (!hasDb()) return 0;
  await initDb();
  const rows = await dbQuery<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM decisions
     WHERE asset_class='crypto' AND routine='crypto-tick' AND decision='BUY'
       AND ts::date = (NOW() AT TIME ZONE 'UTC')::date`,
  );
  return rows.length ? parseInt(rows[0].c, 10) : 0;
}
