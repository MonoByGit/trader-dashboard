# Crypto protective stops (Alpaca paper)

Alpaca **crypto does not support bracket orders** (no OTO/OCO with entry). ETF entries use `order_class: bracket`; crypto cannot.

## What we do

1. **Primary: GTC stop-limit sell** after each buy (`type: stop_limit`, `time_in_force: gtc`). Alpaca holds the stop server-side.
2. **Backup: software stop on each `crypto-scan` tick** — if last trade price ≤ stored stop and no open stop order, submit market sell and log a guard event.

## Trade-offs

| Approach | Pros | Cons |
|----------|------|------|
| Stop-limit (GTC) | Fires when Alpaca sees the trigger; no cron needed | Gap risk; limit leg may not fill in fast crashes |
| Software tick | Catches missing/expired broker stops | Only as fresh as scheduler interval (1–4h); not instant |
| Market sell fallback | Maximizes exit certainty | Slippage on illiquid legs |

**We use stop-limit plus tick backup.** Hard stop % defaults to 8% (env `CRYPTO_HARD_STOP_PCT`) vs 2% on ETFs.

Paper only — no live trading paths.
