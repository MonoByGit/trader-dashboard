import strategyFile from '@/strategy.json';
import { dbQuery, dbRun, hasDb } from '@/lib/db';
import { ensureSchema } from '@/lib/migrate';
import type { StrategyContent, StrategyRulesPatch } from '../../src/strategy/content';
import { mergeStrategyRules, strategyContentFingerprint } from '../../src/strategy/content';

export type StrategyVersionStatus = 'draft' | 'active' | 'retired';

export interface StrategyVersionRow {
  id: string;
  version: string;
  content: StrategyContent;
  status: StrategyVersionStatus;
  notes: string | null;
  created_at: string;
  activated_at: string | null;
  asset_class?: string | null;
}

const SETTINGS_SOFT_START = 'soft_start_enabled';

function defaultContentFromFile(): StrategyContent {
  return strategyFile as StrategyContent;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function ensureActiveStrategyVersion(): Promise<StrategyVersionRow> {
  if (!hasDb()) {
    const content = defaultContentFromFile();
    return {
      id: 'file',
      version: content.version,
      content,
      status: 'active',
      notes: null,
      created_at: new Date().toISOString(),
      activated_at: new Date().toISOString(),
    };
  }
  await ensureSchema();
  const active = await dbQuery<StrategyVersionRow>(
    `SELECT * FROM strategy_versions WHERE status = 'active' AND COALESCE(asset_class, 'etf') = 'etf'
     ORDER BY activated_at DESC NULLS LAST LIMIT 1`,
  );
  if (active[0]) return active[0];

  const content = defaultContentFromFile();
  const id = newId('sv');
  await dbRun(
    `INSERT INTO strategy_versions (id, version, content, status, notes, created_at, activated_at, asset_class)
     VALUES ($1, $2, $3::jsonb, 'active', $4, NOW(), NOW(), 'etf')`,
    [id, content.version, JSON.stringify(content), 'Imported from strategy.json'],
  );
  const rows = await dbQuery<StrategyVersionRow>(`SELECT * FROM strategy_versions WHERE id = $1`, [id]);
  return rows[0]!;
}

export async function getActiveStrategyContent(): Promise<StrategyContent> {
  const row = await ensureActiveStrategyVersion();
  return row.content;
}

export async function getActiveStrategyVersionLabel(): Promise<string> {
  const row = await ensureActiveStrategyVersion();
  return row.version;
}

export async function listStrategyVersions(limit = 50): Promise<StrategyVersionRow[]> {
  if (!hasDb()) return [await ensureActiveStrategyVersion()];
  await ensureSchema();
  return dbQuery<StrategyVersionRow>(
    `SELECT * FROM strategy_versions ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
}

export async function getStrategyVersionById(id: string): Promise<StrategyVersionRow | null> {
  if (!hasDb()) return null;
  await ensureSchema();
  const rows = await dbQuery<StrategyVersionRow>(`SELECT * FROM strategy_versions WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function createDraftStrategyVersion(input: {
  baseVersionId?: string;
  rulesPatch?: StrategyRulesPatch;
  content?: StrategyContent;
  notes?: string;
  versionLabel?: string;
  assetClass?: 'etf' | 'crypto';
}): Promise<StrategyVersionRow> {
  if (!hasDb()) throw new Error('Database not configured');
  await ensureSchema();
  const base = input.baseVersionId
    ? await getStrategyVersionById(input.baseVersionId)
    : await ensureActiveStrategyVersion();
  if (!base) throw new Error('Base strategy version not found');

  let content: StrategyContent;
  if (input.content) {
    content = input.content;
  } else if (input.rulesPatch) {
    content = mergeStrategyRules(
      base.content,
      input.rulesPatch,
      input.versionLabel ?? `${base.version}-draft`,
    );
  } else {
    content = { ...base.content, version: input.versionLabel ?? `${base.version}-draft` };
  }

  const id = newId('sv');
  await dbRun(
    `INSERT INTO strategy_versions (id, version, content, status, notes, created_at, asset_class)
     VALUES ($1, $2, $3::jsonb, 'draft', $4, NOW(), COALESCE($5, 'etf'))`,
    [id, content.version, JSON.stringify(content), input.notes ?? null, input.assetClass ?? 'etf'],
  );
  const rows = await dbQuery<StrategyVersionRow>(`SELECT * FROM strategy_versions WHERE id = $1`, [id]);
  return rows[0]!;
}

export async function activateStrategyVersion(id: string): Promise<StrategyVersionRow> {
  if (!hasDb()) throw new Error('Database not configured');
  await ensureSchema();
  const draft = await getStrategyVersionById(id);
  if (!draft) throw new Error('Strategy version not found');
  if (draft.status !== 'draft') throw new Error('Only draft versions can be activated');

  const assetClass = draft.asset_class ?? 'etf';
  await dbRun(
    `UPDATE strategy_versions SET status = 'retired' WHERE status = 'active' AND COALESCE(asset_class, 'etf') = $1`,
    [assetClass],
  );
  await dbRun(
    `UPDATE strategy_versions SET status = 'active', activated_at = NOW() WHERE id = $1`,
    [id],
  );
  const rows = await dbQuery<StrategyVersionRow>(`SELECT * FROM strategy_versions WHERE id = $1`, [id]);
  return rows[0]!;
}

export async function isSoftStartEnabled(): Promise<boolean> {
  if (!hasDb()) return true;
  await ensureSchema();
  const rows = await dbQuery<{ value: string }>(
    `SELECT value FROM settings WHERE key = $1`,
    [SETTINGS_SOFT_START],
  );
  const raw = rows[0]?.value;
  if (raw === undefined || raw === '') return true;
  return raw === 'true' || raw === '1';
}

export async function setSoftStartEnabled(enabled: boolean): Promise<void> {
  if (!hasDb()) return;
  await ensureSchema();
  await dbRun(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [SETTINGS_SOFT_START, enabled ? 'true' : 'false'],
  );
}

export function contentVersionFingerprint(content: StrategyContent): string {
  return strategyContentFingerprint(content);
}
