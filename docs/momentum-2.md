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
- **Uit tenzij `MOMENTUM2_ENABLED=1`.** Daarna draait het in schaduwmodus (virtueel boek, geen enkele order naar Alpaca) tot `MOMENTUM2_DRY_RUN=0` is gezet. Echte papierorders respecteren de noodstop.
- Logs: tabel `momentum2_log` (kinds `equity`, `trade`, `decision:*`), boeken in `settings` onder `m2:book:<id>`.

## Bekende beperkingen
- Niet tegen echte Alpaca-data of -orders gedraaid; verificatie is unit tests plus synthetische reeksen. Eerst schaduwmodus.
- Hele aandelen (stops kunnen niet op fractionele posities).
- Meerdere versies delen het papieraccount: de som van hun stops mag de echte positie niet overstijgen, wat bij hele aandelen klopt zolang het boek en Alpaca gelijk lopen.
- Stap 2 (nieuwscheck met Alpaca News en Finnhub-kalender) is nog niet gebouwd; het veldmodel/versie in het veto-besluit ligt er al.
