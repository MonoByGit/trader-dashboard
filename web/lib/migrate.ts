import { dbRun, hasDb } from './db';

// Idempotente schema-migratie voor het samenwerkingsbord.
// initDb() wordt nergens aangeroepen, dus we borgen het schema hier en draaien
// het een keer per proces. Alles is additief (IF NOT EXISTS), dus veilig om
// herhaaldelijk uit te voeren tegen een bestaande database.
let ran: Promise<void> | null = null;

async function migrate(): Promise<void> {
  if (!hasDb()) return;

  // Basis-tabellen (mochten ze nog niet bestaan op een verse database).
  await dbRun(`
    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      kind TEXT DEFAULT 'user_initiated',
      tags TEXT[],
      status TEXT DEFAULT 'open',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      from_role TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS lessons (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      why TEXT,
      status TEXT DEFAULT 'proposed',
      hits INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Samenwerkingsbord-velden op threads. Een draad is tegelijk gesprek en taak.
  await dbRun(`
    ALTER TABLE threads ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'gesprek';
    ALTER TABLE threads ADD COLUMN IF NOT EXISTS turn TEXT DEFAULT 'agent';
    ALTER TABLE threads ADD COLUMN IF NOT EXISTS anchor_type TEXT;
    ALTER TABLE threads ADD COLUMN IF NOT EXISTS anchor_id TEXT;
    ALTER TABLE threads ADD COLUMN IF NOT EXISTS summary TEXT;
    ALTER TABLE threads ADD COLUMN IF NOT EXISTS assignee TEXT;
    ALTER TABLE threads ADD COLUMN IF NOT EXISTS due_date DATE;
    ALTER TABLE threads ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normaal';
    ALTER TABLE threads ADD COLUMN IF NOT EXISTS unread INTEGER DEFAULT 0;
  `);

  // Uitbreiding lessons voor de rijke weergave + approval-flow.
  await dbRun(`
    ALTER TABLE lessons ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE lessons ADD COLUMN IF NOT EXISTS category TEXT;
    ALTER TABLE lessons ADD COLUMN IF NOT EXISTS pnl_impact FLOAT DEFAULT 0;
    ALTER TABLE lessons ADD COLUMN IF NOT EXISTS confidence FLOAT;
    ALTER TABLE lessons ADD COLUMN IF NOT EXISTS last_applied_at TIMESTAMPTZ;
  `);

  // Lesvoorstellen: bot stelt voor, Dusty keurt goed/af of markeert gezien.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS lesson_proposals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT,
      status TEXT DEFAULT 'proposed',
      confidence FLOAT,
      related_trades JSONB,
      rationale TEXT,
      proposed_at TIMESTAMPTZ DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      reviewer TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Indexen voor de bord-queries.
  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_threads_status_turn ON threads (status, turn);
    CREATE INDEX IF NOT EXISTS idx_threads_anchor ON threads (anchor_type, anchor_id);
  `);
}

export function ensureSchema(): Promise<void> {
  if (!ran) ran = migrate().catch((e) => { ran = null; throw e; });
  return ran;
}
