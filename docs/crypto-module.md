# Crypto-module (Momentum, paper)

## Wat

Pluggable **asset class** naast US ETF's:

- `web/strategy.json` — ETF (ongewijzigd pad)
- `web/crypto-strategy.json` — crypto, versioned
- Scheduler: ETF-routines volgen Alpaca **market calendar**; crypto draait **`crypto-tick`** elke N uur **24/7** (geen market clock)

## Defaults (stricter dan ETF)

| Guard | Default |
|-------|---------|
| Crypto budget | 10% total equity |
| Per positie | 3% equity |
| Crypto dagverlies | 2% (crypto day-start mark) |
| Hard stop | 8% (software + optionele stop-limit) |
| Soft-start | **Aan**: max 1 nieuwe crypto positie per UTC-dag |
| Module | **Uit** tot authenticated toggle in dashboard (Crypto-tab) |

Global **noodstop**, **kill switch** en **circuit breaker** blokkeren ook crypto-entries.

## Aan/uit

1. Log in (als `APP_PASSWORD` / `APP_PASSWORD_SHA256` gezet is).
2. Tab **Crypto** → schakelaar **Module**.
3. Optioneel dev: `CRYPTO_MODULE_ENABLED=true` (niet voor productie).

## Stops

Geen Alpaca bracket voor crypto → zie [crypto-stops.md](./crypto-stops.md).

## Data

- `decisions.asset_class`, `ai_calls.asset_class`, `alpaca_orders.asset_class`
- `daily_snapshots.asset_breakdown`, `btc_*` benchmark naast SPY
- Backtest: `POST /api/backtests` met `{ "assetClass": "crypto", periodStart, periodEnd }`

## Risico's

- Paper ≠ live fills; gaps tussen ticks bij software stops.
- Crypto deelt **één** Alpaca paper-account met ETF — budgetcaps beperken crypto-exposure.
- Stop-limit kan niet vullen bij flash crashes.
