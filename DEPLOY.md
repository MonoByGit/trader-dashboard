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

Railway cron schema in productie: `*/5 * * * *` (elke dag, elke 5 minuten UTC; de tick beslist zelf in ET). Elke dag is nodig voor
Momentum 6 (BTC, ook in het weekend); de ETF-routines slaan zichzelf over als de markt dicht is.

De tick draait ook de Momentum-stappen (`[momentum-tick] <routine> <dag> <status> <modus>`, modus = schaduw of papier) en,
alleen bij papier, elke tick de stopwacht (`<strategie>-stopwacht`) voor boeken met een ontbrekende stop of een lopende
order: hij volgt die orders, boekt fills één keer en zet elke positie binnen een tick op een stop; hij plaatst zelf nooit een
market order. Wachten op Alpaca is per strategie-run begrensd (45 s echte tijd, ook HTTP), en per strategie loopt in het proces
nooit een dagstap en een stopwacht tegelijk. Vóór echt geld nog nodig: `--max-time` op de curl van scheduler-tick, een
tickbudget ruim onder 5 min of een tick-lock, en een alert als een stop of open order langer dan een tick openstaat.

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
