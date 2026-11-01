# Momentum 3 — agressief (bovenop Momentum 2)

Zelfde raamwerk als `docs/momentum-2.md`: eigen boek per versie, harde stop bij elke instap, trailing stop, verliesgrens met automatische uitschakeling, dagelijkse log versus benchmark. Alleen papier en **alleen schaduwmodus**: `MOMENTUM3_ENABLED=1` zet de route aan, `MOMENTUM3_DRY_RUN=0` wordt geweigerd en de route importeert geen Alpaca-broker (test in `src/momentum2/mode.test.ts`).

## Versies (`src/momentum3/config.ts`)
Budget: 10% van het paperkapitaal (default 100.000), crypto hooguit de helft. Verlieslimiet 15% van het eigen budget, daarna automatisch uit (alles verkocht, geen nieuwe posities).

| Versie | Universum | Instap | Uitstap | Stops | Max posities |
|---|---|---|---|---|---|
| `m3-crypto` (5%) | BTC, ETH, SOL, LTC | RSI(14) was in de laatste 3 dagen < 30 én vandaag draait de koers (slot > slot gisteren, of RSI kruist terug boven 30) | RSI >= 55, of 10 dagen vast | harde stop 7%, trailing 5% pas vanaf +5% winst | 3 (1/3 van budget per positie) |
| `m3-etf` (5%) | de 10 ETF's van M1/M2 | pullback in een uptrend: boven 200d gemiddelde, RSI(14) < 40 in de laatste 3 dagen en draai | RSI >= 60, of 15 dagen vast | harde stop 4%, trailing 3% pas vanaf +3% | 3, klein (25% van budget per positie) |

Kosten in de simulatie: crypto 25 bp fee + 2 bp slippage, ETF 2 bp slippage. Crypto fractioneel, ETF hele aandelen. Posities mogen over nacht.

## Eigen posities
Orders dragen een `m3-`/`m3s-` prefix en M1 (EOD-flatten) laat die staan (zie PR 37). In schaduwmodus emuleert `decideDay` de stops op de dagbar, zodat harde en trailing stop ook in de schaduwrun worden geoefend.

## Backtest met walk-forward
`npx tsx scripts/run-momentum3.ts --start=2022-01-01 [--train=365 --test=90]` (ALPACA-sleutels, alleen marktdata). Per versie: kies per venster de beste parameters op de trainperiode (RSI-trigger x harde stop, score = rendement - 0,5 x drawdown), meet ze op het volgende testvenster dat het model nooit zag, en rapporteer het samengestelde out-of-sample rendement tegen BTC (crypto) en SPY (ETF).

**Status:** het script en de walk-forward-logica zijn getest op synthetische reeksen. Er is hier nog geen echte backtest gedraaid: deze sessie had geen Alpaca-sleutels en geen toegang tot marktdata. De cijfers moeten eerst gedraaid worden door wie de sleutels heeft.

## Schaduwrun
`POST /api/momentum3/run` `{"step":"decide"}` na de close (crypto gebruikt de laatste afgesloten UTC-dag) en `{"step":"execute"}` na de open. Logs in `momentum2_log` (versie-id `m3-crypto` / `m3-etf`), boeken in `settings` onder `m2:book:<id>`.
