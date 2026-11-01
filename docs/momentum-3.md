# Momentum 3 — agressief (bovenop Momentum 2)

Zelfde raamwerk als `docs/momentum-2.md`: eigen boek per versie, harde stop bij elke instap, trailing stop, verliesgrens met automatische uitschakeling, dagelijkse log versus benchmark. Alleen papier en **alleen schaduwmodus**: `MOMENTUM3_ENABLED=1` zet de route aan, `MOMENTUM3_DRY_RUN=0` wordt geweigerd en de route importeert geen Alpaca-broker (test in `src/momentum2/mode.test.ts`).

## Versies (`src/momentum3/config.ts`)
Budget: 10% van het paperkapitaal (default 100.000), crypto hooguit de helft. Verlieslimiet 15% van het eigen budget, daarna automatisch uit (alles verkocht, geen nieuwe posities).

| Versie | Universum | Instap | Uitstap | Stops | Max posities |
|---|---|---|---|---|---|
| `m3-crypto` (5%) | BTC, ETH, SOL, LTC | RSI-dip, min. beweging vs. kosten, bar-dekking, afkoel na uitstap | RSI >= 52 tenzij trailing actief, of 22 dagen vast | harde stop 7%, trailing min. 8% of 3×ATR vanaf +10% | 3 (1/3 van budget) |
| `m3-etf` (5%) | de 10 ETF's van M1/M2 | pullback in uptrend + zelfde filters | RSI >= 58 tenzij trailing actief, of 22 dagen vast | harde stop 4%, trailing 5% of 2×ATR vanaf +5% | 3 (1/3; raster test ook 25%) |

Kosten in de simulatie: crypto 25 bp fee + 2 bp slippage, ETF 2 bp slippage. Crypto fractioneel, ETF hele aandelen. Posities mogen over nacht.

## Eigen posities
Orders dragen een `m3-`/`m3s-` prefix en M1 (EOD-flatten) laat die staan (PR 42 veiligheidsfixes op main). In schaduwmodus emuleert `decideDay` de stops op de dagbar.

## Backtest met walk-forward
`npx tsx scripts/run-momentum3.ts --start=2022-01-01 [--train=365 --test=90]` (ALPACA-sleutels, alleen marktdata). Per venster: beste parameters op train (`m3Grid`: RSI, harde stop, uitstap-RSI, ETF-grootte), meten op test. Score train = rendement − 0,5 × drawdown.

Walk-forward draagt equity en verliesgrens door over testvensters (`initialBook`). Na verliesgrens blijft de versie uit (`haltPersists`, standaard aan). Crypto: `fillGaps` voor datagaten; symbolen met lage dekking vallen uit instap.

## Schaduwrun
`POST /api/momentum3/run` `{"step":"decide"}` na de close en `{"step":"execute"}` na de open. Logs in `momentum2_log`, boeken in `settings` onder `m2:book:<id>`.
