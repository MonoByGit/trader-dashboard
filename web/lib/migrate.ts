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
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
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

  await dbRun(`
    CREATE TABLE IF NOT EXISTS lesson_applications (
      id TEXT PRIMARY KEY,
      lesson_id TEXT NOT NULL,
      decision_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      action TEXT NOT NULL,
      trade_post_mortem_id TEXT,
      pnl_impact FLOAT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_lesson_apps_decision ON lesson_applications (decision_id);
    CREATE INDEX IF NOT EXISTS idx_lesson_apps_lesson ON lesson_applications (lesson_id);

    CREATE TABLE IF NOT EXISTS trade_post_mortems (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      qty FLOAT NOT NULL,
      entry_price FLOAT NOT NULL,
      exit_price FLOAT NOT NULL,
      realized_pnl FLOAT NOT NULL,
      close_reason TEXT NOT NULL,
      entry_decision_id TEXT,
      entry_rationale TEXT,
      learn_note TEXT,
      exit_order_id TEXT,
      closed_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_post_mortems_closed ON trade_post_mortems (closed_at DESC);
  `);

  await dbRun(`
    ALTER TABLE decisions ADD COLUMN IF NOT EXISTS strategy_version TEXT;

    CREATE TABLE IF NOT EXISTS daily_snapshots (
      trading_date DATE PRIMARY KEY,
      equity NUMERIC NOT NULL,
      cash NUMERIC NOT NULL,
      positions JSONB NOT NULL DEFAULT '[]'::jsonb,
      spy_close NUMERIC,
      momentum_daily_return_pct NUMERIC,
      spy_daily_return_pct NUMERIC,
      momentum_cumulative_return_pct NUMERIC,
      spy_cumulative_return_pct NUMERIC,
      baseline_equity NUMERIC,
      baseline_spy_close NUMERIC,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS routine_runs (
      id TEXT PRIMARY KEY,
      routine TEXT NOT NULL,
      trading_date DATE NOT NULL,
      started_at TIMESTAMPTZ NOT NULL,
      finished_at TIMESTAMPTZ,
      status TEXT NOT NULL,
      skip_reason TEXT,
      duration_ms INTEGER,
      error_message TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_routine_runs_day ON routine_runs (trading_date, routine);

    CREATE TABLE IF NOT EXISTS ai_calls (
      id TEXT PRIMARY KEY,
      ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      routine TEXT,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER,
      output_tokens INTEGER,
      cost_usd NUMERIC(12, 6),
      decision_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ai_calls_ts ON ai_calls (ts DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_calls_routine ON ai_calls (routine, ts DESC);

    CREATE TABLE IF NOT EXISTS alpaca_orders (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      qty NUMERIC,
      filled_qty NUMERIC,
      type TEXT,
      status TEXT,
      limit_price NUMERIC,
      stop_price NUMERIC,
      filled_avg_price NUMERIC,
      submitted_at TIMESTAMPTZ,
      filled_at TIMESTAMPTZ,
      raw JSONB,
      synced_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_alpaca_orders_submitted ON alpaca_orders (submitted_at DESC);
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS backtest_runs (
      id TEXT PRIMARY KEY,
      strategy_version TEXT NOT NULL,
      params JSONB NOT NULL DEFAULT '{}'::jsonb,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      metrics JSONB,
      error_message TEXT,
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_backtest_runs_created ON backtest_runs (created_at DESC);

    CREATE TABLE IF NOT EXISTS backtest_trades (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES backtest_runs(id) ON DELETE CASCADE,
      trade_date DATE NOT NULL,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      qty NUMERIC NOT NULL,
      price NUMERIC NOT NULL,
      reason TEXT,
      pnl NUMERIC,
      seq INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_backtest_trades_run ON backtest_trades (run_id, seq);

    CREATE TABLE IF NOT EXISTS backtest_equity_points (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES backtest_runs(id) ON DELETE CASCADE,
      point_date DATE NOT NULL,
      equity NUMERIC NOT NULL,
      cash NUMERIC NOT NULL,
      exposure NUMERIC NOT NULL,
      spy_equity NUMERIC NOT NULL,
      seq INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_backtest_equity_run ON backtest_equity_points (run_id, seq);
  `);
}

export function ensureSchema(): Promise<void> {
  if (!ran) ran = migrate().catch((e) => { ran = null; throw e; });
  return ran;
}
