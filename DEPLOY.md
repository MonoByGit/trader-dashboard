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

De 4 cron-services (premarket/market-open/midday/eod) zijn aparte Railway-services,
losgekoppeld van `main`. `cron-weekly` ontbreekt nog (dashboard-handeling: schema
`30 20 * * 5`, routine `weekly`).

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
