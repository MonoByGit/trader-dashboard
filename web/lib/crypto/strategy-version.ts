import cryptoStrategy from '@/crypto-strategy.json';
import crypto from 'crypto';
import { dbQuery, dbRun, hasDb } from '@/lib/db';
import { ensureSchema } from '@/lib/migrate';
import type { StrategyVersionRow } from '@/lib/strategy-versions';

export function getCryptoStrategyVersion(): string {
  return crypto.createHash('sha256').update(JSON.stringify(cryptoStrategy)).digest('hex').slice(0, 12);
}

export function getCryptoSymbols(): string[] {
  return cryptoStrategy.symbols as string[];
}

export async function ensureActiveCryptoStrategyVersion(): Promise<StrategyVersionRow> {
  if (!hasDb()) {
    return {
      id: 'crypto-file',
      version: cryptoStrategy.version,
      content: cryptoStrategy as StrategyVersionRow['content'],
      status: 'active',
      notes: null,
      created_at: new Date().toISOString(),
      activated_at: new Date().toISOString(),
      asset_class: 'crypto',
    };
  }
  await ensureSchema();
  const active = await dbQuery<StrategyVersionRow>(
    `SELECT * FROM strategy_versions WHERE status = 'active' AND asset_class = 'crypto'
     ORDER BY activated_at DESC NULLS LAST LIMIT 1`,
  );
  if (active[0]) return active[0];

  const id = `sv_crypto_${Date.now().toString(36)}`;
  await dbRun(
    `INSERT INTO strategy_versions (id, version, content, status, notes, created_at, activated_at, asset_class)
     VALUES ($1, $2, $3::jsonb, 'active', $4, NOW(), NOW(), 'crypto')`,
    [id, cryptoStrategy.version, JSON.stringify(cryptoStrategy), 'Imported from crypto-strategy.json'],
  );
  const rows = await dbQuery<StrategyVersionRow>(`SELECT * FROM strategy_versions WHERE id = $1`, [id]);
  return rows[0]!;
}

export async function getActiveCryptoStrategyVersionLabel(): Promise<string> {
  const row = await ensureActiveCryptoStrategyVersion();
  return row.version;
}
