# Momentum 6 — btc-breakout (papier, schaduw)

Instap BTC/USD wanneer de close boven het maximum van de vorige 20 closes ligt. Uitstap: 20% close-disaster (peak close), 12% trail van peak close, close onder 10d low, of na 10 dagen (vanaf **signaal-datum**, niet fill). Budget 5%, `floatingBudget: true`, verliesgrens default 15% (`MOMENTUM6_MAX_LOSS_PCT`), fractioneel, 25 bp fee in sim.

Aan: `MOMENTUM6_ENABLED=1`. Schaduw alleen; `MOMENTUM6_DRY_RUN=0` wordt geweigerd.

Boek: `m:book:m6-btc-breakout`. Orders: prefix `m6-`.

De 20% disaster zit alleen in de **broker GTC stop_limit** (zelfde afstand als peak-close); planM6 plant die exit niet dubbel. Overige uitstappen (trail, 10d low, max hold) blijven close-based op de volgende open.

**Bad ticks:** live crypto gebruikt `stop_limit` met limit ~0,5% onder stop (zie `web/lib/momentum2/broker.ts`). In backtest/sim negeert `barLowForStopCheck` een dag-low die meer dan 15% onder zowel open als close ligt (`src/momentum2/bad-tick.ts`).

Kosten: 25 bp fee + slippage in sim.

Walk-forward: raakt de sleeve de verliesgrens, dan blijft hij gehalt voor de rest van de run (bedoeld).

Backtest: `npx tsx scripts/run-momentum6.ts` (Alpaca keys).
