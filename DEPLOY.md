# Deploy & werkwijze — trader-dashboard

Korte gids zodat deploys betrouwbaar blijven. Hard geleerd op 31 mei 2026.

## De normale route

```
feature branch  ->  PR naar main  ->  CI groen  ->  merge  ->  Railway deployt main
```

- Werk nooit direct op `main`; maak een branch en open een PR.
- De GitHub Actions CI (`.github/workflows/ci.yml`) draait op elke PR: typecheck, lint en build. Moet groen zijn voor de merge.
- Railway is gekoppeld aan GitHub en deployt automatisch bij een push/merge naar `main`.

## Hoe Railway de app bouwt

De Next-app staat in `web/`, niet in de repo-root. De root-`railway.json` pint dit vast:

```json
{
  "build":  { "builder": "NIXPACKS", "buildCommand": "cd web && npm ci && npm run build" },
  "deploy": { "startCommand": "cd web && npm run start -- -p $PORT", "healthcheckPath": "/" }
}
```

> Achtergrond: Railway stapte over op de railpack-builder en bouwde vanaf de
> repo-root (geen start command) waardoor deploys sinds 18 april stil faalden.
> Deze `railway.json` herstelt dat en houdt het version-controlled.

## Scheduler (één Railway-cron)

Vervang de vijf vaste UTC-crontabbladen door **één** service die elke 5 minuten
op werkdagen de tick aanroept. Alpaca-clock + kalender bepalen welke routine due is
(premarket, market-open, midday, eod, weekly), inclusief vakantiedagen, half days en DST.

```
curl -X POST "$NEXT_PUBLIC_APP_URL/api/scheduler/tick" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Railway cron schema: `*/5 * * * 1-5` (ma–vr, elke 5 minuten UTC; de tick beslist zelf in ET).

Handmatig blijft werken: `POST /api/cron` met body `{"routine":"premarket"}` en dezelfde Bearer.

### Snapshots backfill (eenmalig na deploy)

```bash
curl -X POST "$NEXT_PUBLIC_APP_URL/api/snapshots" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Optioneel: `"start":"2026-01-01","end":"2026-05-31"`. EOD schrijft daarna dagelijks idempotent een rij.

**EOD cron (UTC, Railway):** `50 20 * * 1-5` → 15:50 ET in EST (winter). In EDT (zomer)
is dat 16:50 ET; pas het schema aan naar `50 19 * * 1-5` als je in zomertijd vlak vóór
de bel wilt sluiten. De EOD-code gebruikt Alpaca `clock` en sluit niet onbeschermd als
de markt al dicht is.

## Verifiëren vóór een push

`tsc --noEmit` alleen is NIET genoeg: `next build` draait ook ESLint, en een
lint-fout breekt de deploy terwijl tsc groen blijft. Draai daarom:

```
cd web
npx tsc --noEmit
npm run lint
npm run build   # de echte poort; dit is wat Railway ook doet
```

> Let op: lokaal hangt `next dev` / `next build` op dit iCloud Documents-pad
> (webpack file-watcher). `tsc` en `eslint` werken wel. De CI op GitHub (schone
> Linux) bouwt zonder problemen en is de betrouwbare gate.

## Environment-variabelen (Railway, service `trader-dashboard`)

Staan al: `ALPACA_API_KEY`, `ALPACA_SECRET_KEY`, `ALPACA_BASE_URL`, `ANTHROPIC_API_KEY`,
`GOOGLE_AI_API_KEY`, `DATABASE_URL`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`, `OPEN_BRAIN_URL`.

Optioneel (observability, degradeert veilig): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`,
`MONO_API_KEY` (de `x-mono-key` van de eigen Mono API voor Open Brain-sync).

Zie `.env.example` voor de volledige lijst.

## Momentum-schaduwtick (M2, M3, M5, M6)

`POST /api/scheduler/tick` (de bestaande 5-minuten-cron) draait nu ook de Momentum-schaduwstappen, in-process, zonder aparte cron:
- M2/M3/M5 `execute`: 10 min na de open (venster 80 min); `decide`: 10 min na de close (venster 170 min).
- M6 (crypto) `decide` + `execute`: na 00:15 UTC (venster 5 uur), ook in het weekend.
- Alleen strategieën met `MOMENTUMn_ENABLED=1`; `MOMENTUMn_DRY_RUN=0` wordt geweigerd. Geen M4. Alleen schaduw, geen Alpaca-orders.
- Per (strategie, stap, dag) een markering in `settings` (`m:tick:<naam>:<stap>:<dag>`); een fout markeert ook, zodat een halve stap niet dubbel boekt.
- Logregel per stap: `[momentum-shadow-tick] momentum2:execute dag=... schaduw=ja uitkomst=...`.
- Optioneel: `MOMENTUM_TICK_SECRET` (min. 16 tekens). Met header `x-momentum-tick: <secret>` mag `POST /api/momentum{2,3,5,6}/run` langs de app-login (Bearer CRON_SECRET blijft ook vereist). Niet gezet = pad dicht.
