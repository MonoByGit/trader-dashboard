# Guard defaults (Momentum paper)

Hard limits worden afgedwongen in `src/guards/` en via `web/lib/guards/service.ts` in Postgres (`settings` + `guard_events`).

**Soft-start** (`settings.soft_start_enabled`, default `true`): tijdens paper ramp-up worden effectieve limieten verlaagd via `applySoftStartToGuardConfig` — max 2 nieuwe posities/dag, 5% per positie, 15% totale exposure. Market-open gebruikt `getEffectiveGuardConfig()`.

## Circuit breakers

| Parameter | Default | Env |
|---|---|---|
| Daily drawdown | 3% vs day-start equity | `MAX_DAILY_DRAWDOWN_PCT` |
| Peak drawdown | 5% vs session peak | `MAX_PEAK_DRAWDOWN_PCT` |
| Consecutive losses | 3 | `MAX_CONSECUTIVE_LOSSES` |
| Orders per 10 min | 5 | `MAX_ORDERS_PER_10MIN` |

Bij trip: geen nieuwe entries; bestaande bracket-stops blijven bij Alpaca staan.

## Portfolio limits (per order)

| Parameter | Default | Env |
|---|---|---|
| Max open positions | 3 | `MAX_POSITIONS` |
| Max single position | 30% equity | `MAX_POSITION_SIZE_PCT` |
| Max total exposure | 70% equity | `MAX_TOTAL_EXPOSURE_PCT` |
| Min cash reserve | 10% | `MIN_CASH_RESERVE_PCT` |
| Max daily trades | 10 | `MAX_DAILY_TRADES` |
| Max order USD | $30,000 | `MAX_ORDER_SIZE_USD` |
| Min order USD | $500 | `MIN_ORDER_SIZE_USD` |

## Noodstop vs kill switch

- **Kill switch** (`trading_enabled` in DB): blokkeert nieuwe entries; routines blijven draaien.
- **Noodstop** (`emergency_stop` in DB): annuleert orders, sluit posities, kill switch aan, **alle** cron-routines geblokkeerd tot `POST /api/guards/emergency-resume` (achter `APP_PASSWORD`-login).

## EOD clock

- Flatten alleen als markt open is en ≥ `EOD_MIN_MINUTES_BEFORE_CLOSE` (default 2) minuten voor `next_close`.
- Na sluiting: posities houden met bracket protection; geen stops cancelen.
