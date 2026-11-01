# Momentum 6 — btc-breakout (papier, schaduw)

Instap BTC/USD wanneer de close boven het maximum van de vorige 20 closes ligt. Uitstap: 20% close-disaster (peak close), 12% trail van peak close, close onder 10d low, of na 10 dagen (vanaf **signaal-datum**, niet fill). Budget 5%, `floatingBudget: true`, verliesgrens default 15% (`MOMENTUM6_MAX_LOSS_PCT`), fractioneel, 25 bp fee in sim.

Aan: `MOMENTUM6_ENABLED=1`. Schaduw alleen; `MOMENTUM6_DRY_RUN=0` wordt geweigerd.

Boek: `m:book:m6-btc-breakout`. Orders: prefix `m6-`.

Alle exits inclusief 20% disaster zijn **close-based** en vullen bij de volgende open (geen intraday stops; slechte ticks raken de low niet). Kosten: 25 bp fee + slippage in sim.

Walk-forward: raakt de sleeve de verliesgrens, dan blijft hij gehalt voor de rest van de run (bedoeld).

Backtest: `npx tsx scripts/run-momentum6.ts` (Alpaca keys).
