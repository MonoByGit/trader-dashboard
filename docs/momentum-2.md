# Momentum 2 — ETF-rotatie (stap 1)

Tweede strategieversie naast Momentum Breakout. Alleen papiergeld. De code staat in `src/momentum2/` (pure logica, getest zonder netwerk) en `web/lib/momentum2/` (Alpaca, Postgres, DeepSeek).

## Regels
- **Universum:** dezelfde 10 ETF's als `docs/strategy.md`.
- **Filter:** alleen kopen boven het 200-daags gemiddelde én met positief momentum (rendement over `lookbackDays`).
- **Selectie:** top N op momentum. Niets door het filter = cash.
- **Gewichten:** omgekeerd evenredig met de volatiliteit (20 dagen), som = 1.
- **Rebalance:** elke 5 handelsdagen, besluit op de close, uitvoering op de volgende open. Posities gaan over nacht.
- **DeepSeek:** mag alleen een nieuwe instap tegenhouden. Het vrijgekomen gewicht blijft cash. Gehouden posities, verkopen en stops raakt het nooit. Onleesbaar antwoord of fout = geen veto, gelogd als `failedOpen`. Model en versie staan per besluit in de log.
- **Stops:** harde stop bij entry (8%), trailing stop (10% onder het hoogste punt) die alleen omhoog beweegt. Live is dat één GTC-stop per versie per symbool bij Alpaca.
- **Verliesgrens per versie:** onder `budget * (1 - maxLossPct)` gaat de versie dicht: alles verkocht, geen nieuwe posities.
- **Meebewegend budget:** positiegrootte volgt de equity van de versie (`floatingBudget`).

## Meerdere versies tegelijk
`DEFAULT_VERSIONS` in `config.ts`. Elke versie heeft een eigen boek (virtuele sleeve op het ene papieraccount), eigen budget, eigen verliesgrens en eigen log. Elke dag schrijft elke versie een regel `equity` met `spyEquity` en `excessVsSpyPct` (SPY buy-and-hold geschaald naar het startbudget).

## Draaien
- Backtest: `npx tsx scripts/run-momentum2.ts --start=2023-01-02` (ALPACA-sleutels, alleen marktdata).
- Live: `POST /api/momentum2/run` met `Authorization: Bearer $CRON_SECRET` en `{"step":"decide"}` na de close (±16:20 ET) en `{"step":"execute"}` kort na de open (±09:35 ET).
- **Uit tenzij `MOMENTUM2_ENABLED=1`.** Daarna draait het uitsluitend in schaduwmodus (virtueel boek, geen enkele order naar Alpaca). `MOMENTUM2_DRY_RUN=0` wordt geweigerd: er bestaat in deze versie geen pad naar echte orders (`src/momentum2/mode.ts`, getest). De Alpaca-broker (`web/lib/momentum2/broker.ts`) hangt niet aan de route.
- Logs: tabel `momentum2_log` (kinds `equity`, `trade`, `decision:*`), boeken in `settings` onder `m:book:<id>` (legacy `m2:book:<id>` wordt nog gelezen bij load).

## Checklist voor echte papier-orders (aparte PR, na Dave's review van 84a8b55)
1. `setStop` faalt: pending wissen en boek opslaan pas ná een gelukte stop; mislukte stop = positie meteen sluiten of retry, nooit zonder stop laten staan.
2. Onbevestigde vulling (timeout, 5xx, `partially_filled`): opzoeken op `client_order_id` en de vulling uit de broker overnemen, niet `null` aannemen.
3. Stop vervangen: eerst nieuwe plaatsen, dan oude annuleren; vast `client_order_id` per (versie, symbool, niveau) tegen dubbele stops bij retry.
4. Eigen positie per strategie: boeken met `real: true` tellen mee in `foreignQtyForSymbol`. Hieronder al gedaan voor Momentum 1.
5. Daglimiet, circuit breaker en maximum aantal posities ook voor M2 laten gelden; overweeg een eigen Alpaca sub-account.

## Eigen posities per strategie
Orders van andere strategieën dragen een `client_order_id`-prefix (`m2-`, `m2s-`, `m3-`, ...; `src/trading/strategy-tags.ts`). De EOD-flatten van Momentum 1 annuleert die stops niet en sluit alleen `brokerqty - qty van echte M2/M3/M4-boeken`. Zonder echte boeken verandert er niets aan Momentum 1.

## Bekende beperkingen
- Niet tegen echte Alpaca-data of -orders gedraaid; verificatie is unit tests plus synthetische reeksen.
- Een veto-check die faalt laat de instap door (bewust: DeepSeek mag alleen afremmen), maar staat als `failedOpen` in de log.
- Hele aandelen (stops kunnen niet op fractionele posities).
- Meerdere versies delen het papieraccount: de som van hun stops mag de echte positie niet overstijgen, wat bij hele aandelen klopt zolang het boek en Alpaca gelijk lopen.
- Stap 2 (nieuwscheck met Alpaca News en Finnhub-kalender) is nog niet gebouwd; het veldmodel/versie in het veto-besluit ligt er al.
