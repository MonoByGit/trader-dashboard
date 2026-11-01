# Momentum UI survey: main 1286950 (read-only)
Clone: /workspace/bull/td-ui (detached at origin/main 1286950). Nothing pushed, no Railway changes, no orders. Live probes were limited to unauthenticated GET /api/health and POSTs with a fake bearer (all rejected).

## 1. Pages and views (web/app)
There is one real route, `/`, plus `/login`. All other "pages" are client-side tabs.
- `app/page.tsx:3` → `ResponsiveRoot` (`components/shell/ResponsiveRoot.tsx:11-25`): matchMedia ≤768px → `MobileApp`, otherwise `DashboardShell`.
- `app/login/page.tsx`: password form that posts to /api/auth/login.
- Desktop tabs (`components/shell/DashboardShell.tsx:29-41`, switch at `:277-300`, chosen tab kept in localStorage 'trader-page'). Labels are mostly English:
  Overview, Crypto, ETF Positions, Decision Log, Conversations, Routines, Risk & Guards, Strategy, Lessons, Reports, AI-kosten, History, Backtests.
  - OverviewPage (`components/pages/OverviewPage.tsx`): KPIs from Alpaca (equity, day P&L, cash, open positions "/3", "Volgende routine" which is always TRADER_ROUTINES[0], AI cost). Equity curve from /api/snapshots. "Agent Activity" from /api/decisions?limit=50 (`:78`). "Today's Routines" (`:309-330`) is a static list that always says "Gepland". Watchlist card (`:370-383`) is a hardcoded placeholder. Guard snapshot at `:396`.
  - RoutinesPage: the table comes from `MOCK.routines` (`RoutinesPage.tsx:55`), so last-run times and statuses are FAKE demo data. The Run button calls /api/trigger.
  - StrategyPage: config comes from `MOCK.strategyConfig` (`StrategyPage.tsx:28`) and the watchlist from MOCK (`:194`). Only strategy-versions are real.
  - ConversationsPage seeds from `MOCK.threads` (`:58`).
  - HistoryPage: live /api/alpaca/orders. It falls back to MOCK.tradeHistory only while loading.
  - CryptoPage: /api/crypto + /api/snapshots. DecisionLogPage: /api/decisions?limit=200. ReportsPage: /api/reports. LessonsPage, BacktestsPage, AiCostsPage: their own APIs.
- Mobile tabs (`components/mobile/MobileApp.tsx:149-160`): overview, activity (decisions), board (threads), more. They use the same hooks: useAccount/usePositions (`hooks/useAlpaca.ts`), /api/guards, /api/decisions?limit=200 (`:66`), and /api/threads.
- No view shows M2/M3/M5/M6 at all, and no view shows a scheduler heartbeat or last tick.

## 2. API routes (web/app/api)
- auth/login, logout, session (cookie).
- alpaca/account: equity, cash, dayPnl = equity − last_equity, dayPnlPct, marketOpen (`alpaca/account/route.ts:4-23`).
- alpaca/positions (GET, DELETE closes a position), alpaca/orders (GET last 100 live orders, `:8-28`). It does not expose client_order_id, so you cannot tell which strategy placed an order. alpaca/bars.
- decisions (GET from the `decisions` table, POST), orders (GET from the `alpaca_orders` mirror), runs (GET from `routine_runs`; no UI uses it), snapshots (GET; POST needs a bearer), reports, guards (+ emergency-stop/resume, soft-start, reset-breaker), crypto, ai-costs, lessons*, strategy-versions*, backtests*, threads*, conversations, agent/*.
- cron (bearer, `{routine}` ∈ premarket|market-open|midday|eod|weekly), scheduler/tick (bearer, `scheduler/tick/route.ts`), trigger (cookie → server-side call to /api/cron with CRON_SECRET, `trigger/route.ts:3-15`).
- momentum2/run, momentum3/run, momentum5/run, momentum6/run (bearer CRON_SECRET, `{step: decide|execute}`).
- health → `{ok:true,status:'ok'}` only (`src/security/health-payload.ts:2`). It carries no tick info.

## 3. Data: tables and writers
Schema lives in `web/lib/migrate.ts` (ensureSchema) and `web/lib/db.ts` (initDb).
- `decisions` (migrate.ts:14; +strategy_version :147, +asset_class :222). Written by `lib/decisions.ts:25` saveDecision, which is called from M1 ETF routines (`lib/cron-routines.ts:11`) and crypto (`lib/crypto/routines.ts:9`). Columns: routine, symbol, decision, criteria, rationale, agent_note, confidence, order_id. **Only M1 writes here.**
- `alpaca_orders` (migrate.ts:204; raw JSONB holds client_order_id). Mirrored by `lib/orders-store.ts:43` syncRecentOrders from the M1 routines.
- `routine_runs` (migrate.ts:165: routine, trading_date, started_at, finished_at, status ok|failed|skipped|running, skip_reason, error_message, asset_class). Written by `lib/routine-runs.ts` through `dispatchRoutine` (`lib/routine-dispatch.ts:27-101`). Only routines that were *due* produce rows.
- `guard_events` (db.ts:97). `scheduler_tick_fail` is logged in `scheduler-service.ts:95`.
- `settings` (migrate.ts:36): guard state keys (`lib/guards/service.ts:39-50`: trading_enabled, emergency_stop, circuit_breaker_*), `crypto_module_enabled` (`lib/crypto/state.ts:4`), strategy books `m:book:<versionId>` and pending orders `m:pending:<versionId>` (`src/momentum2/book-keys.ts`; legacy m2:*).
- `momentum2_log` (`lib/momentum2/store.ts:14`): version_id, kind ∈ equity|trade|decision:<rebalance|halt|veto|stop|skip>, day, payload JSONB. This is the trade/signal log for M2/M3/M5/M6. TradeLogRow has `reason` (`src/momentum2/types.ts:74-82`) and DecisionRecord has `detail` (`src/momentum2/live.ts:29-36`).
- `daily_snapshots` (migrate.ts:149, written by `lib/snapshots.ts`), `agent_reports` (cron-routines.ts:635), `ai_calls`, `backtest_*`, `strategy_versions`, lessons*, threads/conversations.
- **There is no scheduler-tick log.** `runSchedulerTick` (`lib/scheduler-service.ts:37-104`) returns its result only in the HTTP response. Nothing is persisted unless a routine was due (routine_runs) or a tick failed (guard_events).

## 4. Strategies and how mode is decided
| Strategy | Version ids | Runs via | Mode logic |
|---|---|---|---|
| M1 ETF (premarket, market-open, midday, eod, weekly) | strategy_versions (active) | scheduler tick → dispatchRoutine (`cron-routines.ts:684-688`) | **Places real paper orders.** Gated by `canRunRoutine` (`src/guards/routine-gates.ts:8-23`): emergency_stop blocks everything; trading_enabled=false or circuit breaker blocks entry routines. Soft-start limits apply. |
| M1 crypto (crypto-scan) | crypto strategy-version | scheduler tick (`crypto/routines.ts:378`, `decideDueCryptoRoutines`) | Real paper orders when `crypto_module_enabled` is on plus the same guards. |
| M2 rotation | m2-rotatie-a, m2-rotatie-b (`src/momentum2/config.ts:7,28`) | POST /api/momentum2/run only | `resolveMomentum2Mode` (`src/momentum2/mode.ts:10-16`): runs only if MOMENTUM2_ENABLED='1'. MOMENTUM2_DRY_RUN='0' is refused. **Always shadow** (`lib/momentum2/run.ts:25`, shadowBroker). |
| M3 | m3-crypto, m3-etf (`src/momentum3/config.ts:52,75`) | POST /api/momentum3/run | `resolveShadowMode(env,'MOMENTUM3')` (`mode.ts:19-25`). Always shadow. |
| M5 Nasdaq trend | m5-nasdaq-trend, m5-nasdaq-tqqq (opt-in MOMENTUM5_TQQQ=1) (`src/momentum5/config.ts:56,63,71`) | POST /api/momentum5/run | `resolveShadowMode(env,'MOMENTUM5')`, shadowBroker (`lib/momentum5/run.ts:16,50`). Always shadow. |
| M6 BTC breakout | m6-btc-breakout (`src/momentum6/config.ts:22`) | POST /api/momentum6/run | `resolveShadowMode(env,'MOMENTUM6')` (`lib/momentum6/run.ts:15`). Always shadow. |
| M4 | (not on main) | no | no |
On main there is no code path to "real paper" for M2/M3/M5/M6. PR 47 would add one, but it is not merged. A status badge can therefore be computed server-side: `enabled = env.X_ENABLED==='1'`, `mode = enabled ? 'schaduw' : 'uit'`. M1 is 'echt (paper)' unless the guards block it. Expose only booleans, never env values.

## 5. Auth
- Cookie `momentum_session` (`lib/auth.ts:5`): an HMAC-signed payload with 30-day maxAge, httpOnly, secure in prod (`:133-146`). Auth is on when APP_PASSWORD or APP_PASSWORD_SHA256 is set (`:18-21`).
- `middleware.ts:14-48`: public assets and /api/health pass. **/api/cron, /api/scheduler/\*, POST /api/snapshots, and /api/auth/\* are exempt** (`:29-33`). Every other /api/* route needs the cookie and otherwise returns 401 `{"error":"Niet ingelogd"}`. Pages redirect to /login?next=…
- Prod with no password returns 503 (`src/security/middleware-auth.ts:16-23`).
- `AuthGate.tsx` exists but is not used by app/page.tsx. The middleware does the gating.

## 6. Why the screen is empty or confusing (most likely causes)
1. **M2/M3/M5/M6 never run in production.** Their /api/momentumN/run routes are NOT in the middleware exemptions, so a bearer-only cron call gets 401 before it reaches the route. Verified live just now: `POST /api/momentum5/run` with a bearer → `{"error":"Niet ingelogd"}`, while `/api/scheduler/tick` and `/api/cron` → `{"error":"Unauthorized"}` (they reach the route). The scheduler tick also never calls runMomentumN; grep finds no caller besides the routes and scripts/. So `momentum2_log` and `m:book:*` are very likely empty in prod, and no "M5/M6 shadow day" can happen from cron. (Fixing this means a middleware exemption plus wiring into the tick or a cron. That is engine work with Dave and Johnny, not UI.)
2. The UI reads only M1 data. Decisions, alpaca_orders and snapshots come only from M1 routines. If the guards or kill switch skip M1, or the market is closed or flat, Agent Activity shows only the placeholder text (`OverviewPage.tsx:150-158`).
3. Fake or static content: Routines tab = MOCK (`RoutinesPage.tsx:55`). Overview "Today's Routines" always says "Gepland" (`OverviewPage.tsx:313-325`). "Volgende routine" is always premarket. Watchlist is a hardcoded placeholder (`:370-383`). StrategyPage config is MOCK (`:28`). Conversations is seeded from MOCK.
4. There is no health or last-tick signal: /api/health is static and no tick is persisted. /api/runs exists, but no UI calls it.
5. Silent fetch failures: all page fetches `.catch(() => [])` or null and render "empty", for example `OverviewPage.tsx:96,103,108` and `useAlpaca.ts:178-181`. A 401 (expired cookie) or 500 (Alpaca or DB error) therefore looks like "no data". /api/alpaca/account returns 500 on any Alpaca error (`account/route.ts:21-22`).
6. Labels are mostly English and technical (Kill switch, Circuit breaker, Peak DD, "/3" positions). There is no plain-language Dutch status line.
7. Risky button: clicking a routine card on Overview (`OverviewPage.tsx:318`) or Run on the Routines page triggers /api/trigger → /api/cron, which is a manual premarket/market-open run. That conflicts with the rule "never trigger by hand". Its id 'close' (`lib/routines-config.ts`) doesn't match handler 'eod', so that one fails with "Unknown routine". The new home screen should not include trigger buttons.

## 7. Suggested build brief (one PR, UI plus read-only API)
- New `GET /api/home` (cookie-protected by default via middleware), server-side only, read-only:
  - account: alpaca.account() → equity, dayPnl = equity − last_equity, dayPnlPct, cash; clock.is_open/next_open.
  - strategies: a static registry [M1-ETF, M1-crypto, M2 a/b, M3 crypto/etf, M5 trend(/tqqq), M6], each with `enabled` (env flag === '1' or guard/settings), `mode` ('echt (paper)' | 'schaduw' | 'uit' | 'geblokkeerd: <reden>'), and last activity = MAX(created_at) from momentum2_log per version_id or routine_runs per routine. Book equity is read from settings `m:book:<id>` (fall back to `m2:book:`). Expose booleans and labels only, never env values.
  - activity: merge the latest N from `decisions` (rationale/agent_note) and `momentum2_log` kind trade|decision:* (payload.reason/detail), plus Alpaca orders including client_order_id → strategy via prefix (m3-, m5-, m6-, m5s-, m6s-; anything else = M1).
  - engine: the latest routine_runs row (status, finished_at, error_message), the latest guard_events scheduler_tick_fail, and a NEW heartbeat. In runSchedulerTick, write `settings['scheduler_last_tick'] = {at, due, errors}` (a one-line, idempotent upsert, wrapped in try/catch so a failure can never break the tick). Show "Motor gezond" if the last tick is less than 15 minutes old on a weekday, otherwise a warning.
- New Dutch home component as the default tab on desktop (DashboardShell) and mobile (MobileApp overview): 4 cards (Portefeuille vandaag, Strategieën, Laatste trades & signalen met reden, Motor). Show errors explicitly (401 → "Opnieuw inloggen", 500 → "Alpaca/DB niet bereikbaar"). No buttons that place orders or trigger routines.
- Tests: pure mapping functions (mode resolver → label, order prefix → strategy, freshness → health) in src/ with no next/* or pg imports, so the root `npm test` keeps working.
- Out of scope, but flag to Dave and Johnny: middleware exemption + cron wiring for /api/momentumN/run (point 6.1). Without it the strategy cards will truthfully show "aan, schaduw, nog nooit gedraaid".
