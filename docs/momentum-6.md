# Momentum 6 — btc-breakout (papier, schaduw)

Instap BTC/USD wanneer de close boven het maximum van de vorige 20 closes ligt. Uitstap: 12% trailing vanaf peak, close onder 10d low, of na 10 dagen. Budget 5%, verliesgrens 15%, fractioneel, 25 bp fee in sim.

Aan: `MOMENTUM6_ENABLED=1`. Schaduw alleen; `MOMENTUM6_DRY_RUN=0` wordt geweigerd.

Boek: `m:book:m6-btc-breakout`. Orders: prefix `m6-`.

Backtest: `npx tsx scripts/run-momentum6.ts` (Alpaca keys).
