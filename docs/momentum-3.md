# Momentum 3 — agressief (bovenop Momentum 2)

Zelfde raamwerk als `docs/momentum-2.md`: eigen boek per versie, harde stop bij elke instap, trailing stop, verliesgrens met automatische uitschakeling, dagelijkse log versus benchmark. Alleen papier en **alleen schaduwmodus**: `MOMENTUM3_ENABLED=1` zet de route aan, `MOMENTUM3_DRY_RUN=0` wordt geweigerd en de route importeert geen Alpaca-broker (test in `src/momentum2/mode.test.ts`).

## Versies (`src/momentum3/config.ts`)
Budget: 10% van het paperkapitaal (default 100.000), crypto hooguit de helft. Verlieslimiet 15% van het eigen budget, daarna automatisch uit (alles verkocht, geen nieuwe posities).

| Versie | Universum | Instap | Uitstap | Stops | Max posities |
|---|---|---|---|---|---|
| `m3-crypto` (5%) | BTC, ETH, SOL, LTC | RSI(14) was in de laatste 3 dagen < 30 én vandaag draait de koers (slot > slot gisteren, of RSI kruist terug boven 30) | RSI >= 50, of 12 dagen vast | harde stop 7%, trailing 6% pas vanaf +9% winst | 3 (1/3 van budget per positie) |
| `m3-etf` (5%) | de 10 ETF's van M1/M2 | pullback in een uptrend: boven 200d gemiddelde, RSI(14) < 40 in de laatste 3 dagen en draai | RSI >= 55, of 15 dagen vast | harde stop 4%, trailing 3% pas vanaf +5% | 3, klein (25% van budget per positie) |

Kosten in de simulatie: crypto 25 bp fee + 2 bp slippage, ETF 2 bp slippage. Crypto fractioneel, ETF hele aandelen. Posities mogen over nacht.

## Eigen posities
Orders dragen een `m3-`/`m3s-` prefix en M1 (EOD-flatten) laat die staan (zie PR 37). In schaduwmodus emuleert `decideDay` de stops op de dagbar, zodat harde en trailing stop ook in de schaduwrun worden geoefend.

## Backtest met walk-forward
`npx tsx scripts/run-momentum3.ts --start=2022-01-01 [--train=365 --test=90]` (ALPACA-sleutels, alleen marktdata). Per versie: kies per venster de beste parameters op de trainperiode (RSI-trigger x harde stop, score = rendement - 0,5 x drawdown), meet ze op het volgende testvenster dat het model nooit zag, en rapporteer het samengestelde out-of-sample rendement tegen BTC (crypto) en SPY (ETF).

**Status:** het script en de walk-forward-logica zijn getest op synthetische reeksen. Er is hier nog geen echte backtest gedraaid: deze sessie had geen Alpaca-sleutels en geen toegang tot marktdata. De cijfers moeten eerst gedraaid worden door wie de sleutels heeft.

## Schaduwrun
`POST /api/momentum3/run` `{"step":"decide"}` na de close (crypto gebruikt de laatste afgesloten UTC-dag) en `{"step":"execute"}` na de open. Logs in `momentum2_log` (versie-id `m3-crypto` / `m3-etf`), boeken in `settings` onder `m2:book:<id>`.

## Eerste backtest (Bull, 1 november 2026) en wat daarop is aangepast
Uitkomst van de eerste versie: crypto -28,5% tegen BTC +45,8% (walk-forward, 18 vensters), ETF +6,4% tegen SPY +80,3% (9 vensters). M3 verslaat zijn benchmark in die vorm niet. Bull noemde vier oorzaken; dit is wat er per punt veranderd is. **Er is niet gemeten of het helpt: deze sessie heeft geen marktdata. Bull draait het opnieuw.**

1. **Verliesgrens over vensters heen.** Elk testvenster begon met een vers boek, dus de 15% grens werd per venster gereset. Nu blijft een gehalte versie uit in alle volgende vensters (`haltPersists`, standaard aan) en het resultaat noemt de datum (`haltedOn`). Zet `haltPersists:false` om de oude gedraging te reproduceren.
2. **Trailing en kosten.** De trailing stop (5% trail vanaf +5%) stapte rond break-even uit en at de winst op in kosten. Nu moet de activatiedrempel hoger liggen dan de afstand (`trailLocksProfit`, getest voor de defaults en het hele raster): crypto +9% / 6%, ETF +5% / 3%, dus de eerste trailing-uitstap staat altijd in de plus. RSI-uitstap lager (crypto 50, ETF 55) omdat bijna niets de oude drempel haalde. Nieuw: afkoelperiode na een uitstap (crypto 5 dagen, ETF 3) tegen herhaald kopen na een stop (29 harde stops in 121 trades). Het raster (`m3Grid`) is ruimer: ook uitstap-RSI en, voor ETF, positiegrootte.
3. **Gaten in de data.** SOL/USD had 1678 bars tegen 2096 voor de rest. De walk-forward vult voor crypto ontbrekende dagen met een vlakke bar op het vorige slot (`fillGaps`, volume 0). Dat is een verbetering van de uitlijning, geen echte koersen; de gaten zelf blijven een datakwaliteitsprobleem.
4. **ETF-blootstelling.** Maximaal 75% belegd (3 x 25%) bleef bewust staan (kleine positiegrootte was de opdracht), maar 1/3 per positie zit nu in het raster, zodat de test laat zien wat de blootstelling kost.

Niet opgelost, wel eerlijk om te weten: met 54 bp per rondreis aan kosten in crypto en een winstverhouding die door de 7% stop wordt beperkt, kan de strategie ook na deze wijzigingen structureel verliezen. De volgende stap is Bulls nieuwe cijfers, niet meer tuning op gevoel.
