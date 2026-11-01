import { envCryptoModuleForcedOn } from '@crypto/config';
import { dbQuery, dbRun, hasDb, initDb } from '@/lib/db';

const SETTINGS_KEY = 'crypto_module_enabled';

export async function isCryptoModuleEnabled(): Promise<boolean> {
  if (envCryptoModuleForcedOn()) return true;
  if (!hasDb()) return false;
  await initDb();
  const rows = await dbQuery<{ value: string }>(`SELECT value FROM settings WHERE key=$1`, [SETTINGS_KEY]);
  return rows.length > 0 && rows[0].value === 'true';
}

export async function setCryptoModuleEnabled(enabled: boolean): Promise<void> {
  if (!hasDb()) return;
  await initDb();
  await dbRun(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
    [SETTINGS_KEY, enabled ? 'true' : 'false'],
  );
}
