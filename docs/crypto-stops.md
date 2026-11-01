# Crypto protective stops (paper)

Alpaca **paper crypto** ondersteunt geen **bracket**-orders (geen geïntegreerde stop + take-profit in één parent order zoals bij US equities).

## Wat Momentum doet

1. **Primair: software stops** — elke `crypto-tick` (24/7) leest posities en laatste prijzen. Als de markt onder de opgeslagen stop of boven take-profit komt, plaatst de routine een **market sell** (paper).
2. **Optioneel: stop-limit** — na een buy kan de routine een aparte **stop_limit** sell (GTC) plaatsen als Alpaca het symbool accepteert. Faalt dat, blijft de software-stop actief.

## Trade-offs

| Aanpak | Voordeel | Nadeel |
|--------|----------|--------|
| Software stop (elke tick) | Geen bracket nodig; zelfde logica als backtest | Gap tussen ticks: prijs kan door stop heen bewegen vóór de volgende tick |
| Stop-limit op exchange | Bescherming tussen ticks | Kan **niet vullen** bij snelle daling (limit onder stop); geen bracket take-profit |

**Default tick-interval:** 2 uur (`CRYPTO_TICK_INTERVAL_HOURS`). Korter = minder gap-risico, meer API/AI-load.

Global **noodstop** en **dag-/piek-drawdown** guards stoppen ook crypto-entries; software stops blijven draaien zolang de module aan staat en geen noodstop actief is die alles blokkeert.
