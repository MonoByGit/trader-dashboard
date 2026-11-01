# Review PR 50 (tab Vandaag) op head 035b4ef3

Reviewer: Dave · Techniek · 2026-11-01 17:35 CET (Amsterdam). Head om 17:20 CET nog steeds 035b4ef3611e64567ab2523ba284fcd5ed23056e.
Repro's en logs: /workspace/dave/momentum-1101-1709/ (ook op branch dave/pr47-repros onder dave-review/momentum-1101/)

## Status: al gemerged zonder review
PR 50 staat op main als 83bcf4c (16:10Z = 17:10 CET, door MonoByGit/studio). Die tree is identiek aan 035b4ef3 (`git diff 035b4ef3 origin/main` is leeg). Railway deploy 97f1ad4c staat op SUCCESS (17:10 CET). De bevindingen hieronder staan dus nu live. Fixen gaat via een nieuwe fix-PR, niet via een revert (Johnny beslist over een revert).

## Verdict: NOT GREEN

## CI op de exacte head 035b4ef3
- `guard unit tests`: success (124901354691)
- `typecheck, lint & build (web)`: success (124901453087)
- Niets pending. Main 83bcf4c zelf heeft 0 check runs.
- Lokaal draait root `npm test` zonder web/node_modules 377/377 groen (logs-m50/root-test-serial.log). Dat klopt met Cosmo's 377. tsc 0, lint 0, build 0.

## Wat goed is (gecontroleerd)
- /api/home is alleen GET. Er worden geen orders, routines of schrijfacties gedaan. De lees-SQL is begrensd: runs met LIMIT 300 en 10 dagen, decisions met LIMIT 10, settings op één key.
- De route zit achter de login. De middleware laat alleen /api/health, /api/cron, /api/scheduler/, POST /api/snapshots en /api/auth/ door. Live gecontroleerd: GET /api/home zonder cookie geeft 401 `{"error":"Niet ingelogd"}`.
- Elk blok heeft een eigen try/catch: account, guards, runs, besluiten en hartslag (settings['scheduler_last_tick']). Een fout komt in `bronfouten` en de pagina toont "Niet alles gelezen: …". Een accountfout toont "Account niet gelezen: …".
- Er zijn vier blokken, met Nederlandse labels en tijden in Europe/Amsterdam.
- De hartslag sluit aan op de schrijver in scheduler-service.ts:130 (`{at, due, errors:number}`).
- De Run-knoppen en de /api/trigger-aanroepen zijn weg uit Overview, Routines en de DashboardShell-modal. De MOCK-import is weg uit Conversations, Routines en Strategy.
- `started_at::text` en `ts::text` komen uit echte Postgres als `2026-11-01 21:30:00.5+00` (geen ISO). V8 en JavaScriptCore (bun 1.4.2) parsen dat goed, ook met +01 en -05 (repros/pr50-ts-text.mjs en pr50-ts-jsc.log). Het is dus geen blocker. Toch is `toISOString()` in de route netter.

## Blockers

### B1. Tab Routines toont altijd "Nog geen runs.", ook als er runs zijn
- web/components/pages/RoutinesPage.tsx:17-18 vraagt `/api/runs?limit=60` op en doet `setRuns(Array.isArray(j) ? j : [])`.
- Zonder `date` of `asset_class` geeft web/app/api/runs/route.ts:37 `{ today, runs }` terug, dus een object en geen array. De pagina zet dan `[]` en laat "Nog geen runs." zien.
- Dat botst met de eis "fouten zichtbaar, niet leeg". Het is ook live, want op 1 nov staan er momentum6-run-rijen.
- Repro: repros/dave-pr50-routines-empty.test.ts (log pr50-routines-empty-raw.log). Echte route en echte listRecentRuns op pglite, met een echte routine_runs-rij (TIMESTAMPTZ). Resultaat: `{"status":200,"keys":["today","runs"],"runsInDb":1,"shownByPage":0}`, dus FAIL.
- Fix: in de pagina `j.runs` lezen. Een onverwachte vorm moet een zichtbare fout geven en geen lege lijst. Voeg een test toe op het contract tussen pagina en route.

### B2. Demodata staat nog in de app: History toont nep-trades zolang de echte orders laden
- web/components/pages/HistoryPage.tsx:6 en :85 gebruiken `MOCK.tradeHistory`. Zolang `/api/alpaca/orders` nog niet terug is (`liveOrders === null`), toont de pagina neptrades met KPI's: aantal, winrate, netto P&L, gem. winst en verlies.
- Een fetch-fout wordt bovendien stil `[]`. Dan staat er "0 total" in plaats van een fout.
- Johnny's eis was dat de demodata wordt opgeruimd. De PR-beschrijving zegt "demodata weg". Dat klopt voor deze pagina dus niet.
- Repro: open de tab History met een trage of geblokkeerde /api/alpaca/orders. Tot de fetch klaar is, staan er neptrades met P&L. Code: HistoryPage.tsx:29 (`if (liveOrders !== null)`) en daarna de MOCK-tak vanaf :85.
- Fix: de MOCK-tak verwijderen en een laadstatus tonen. Een fetch-fout moet zichtbaar zijn. Haal de laatste MOCK-gebruiker weg. Daarna mag `@/lib/mock` alleen nog types leveren.

## Volgpunten (niet blokkerend)
1. M1 heet "ECHT (PAPIER)" met een groen label. "Papier" is duidelijker voor Dusty, want er is geen echt geld.
2. Na PR 47 toont build-home.ts:64 (resolveShadowMode) M5/M6 met DRY_RUN=0 als GEBLOKKEERD, terwijl er dan papierorders lopen. Dit valt onder PR 47 B4, maar raakt dit bestand.
3. In lastRun() sorteert localeCompare op `started_at::text`. Dat is alleen juist zolang de sessie-TimeZone vast staat. Liever sorteren op Date of epoch.
4. /api/trigger bestaat nog (POST, achter login). Er zijn geen knoppen meer, maar overweeg de route te verwijderen of af te sluiten.
5. `env: process.env` gaat naar buildHome. Er komen alleen statussen en redenen terug en geen waarden. Prima, maar geef liever alleen de MOMENTUM*-sleutels door.
