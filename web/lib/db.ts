import { Pool } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!global.__pgPool) {
    global.__pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 5,
    });
  }
  return global.__pgPool;
}

export async function dbQuery<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const pool = getPool();
  if (!pool) return [];
  const result = await pool.query(sql, params);
  return result.rows as T[];
}

export async function dbRun(sql: string, params?: unknown[]): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  await pool.query(sql, params);
}

export async function initDb(): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      ts TIMESTAMPTZ NOT NULL,
      routine TEXT NOT NULL,
      symbol TEXT NOT NULL,
      decision TEXT NOT NULL,
      criteria JSONB,
      rationale TEXT,
      agent_note TEXT,
      confidence FLOAT,
      order_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS agent_reports (
      id TEXT PRIMARY KEY,
      date DATE NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL,
      kpis JSONB,
      narrative TEXT,
      status TEXT DEFAULT 'final',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      from_role TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      kind TEXT DEFAULT 'user_initiated',
      tags TEXT[],
      status TEXT DEFAULT 'open',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      why TEXT,
      status TEXT DEFAULT 'proposed',
      hits INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

export function hasDb(): boolean {
  return !!process.env.DATABASE_URL;
}
