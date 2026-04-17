# Momentum Breakout — Trading Strategy Specification

**Version:** 1.0
**Last updated:** 2026-04-17
**Scope:** Autonomous paper trading agent (Alpaca Paper Trading)

> This document is the authoritative runtime specification for the trading agent. It is read at each routine execution. Treat every rule as a hard constraint unless explicitly marked as advisory.

---

## 1. Overview

### Strategy Name
Momentum Breakout

### Philosophy
Ride established momentum on highly liquid US large cap ETFs. Enter only when price action, trend, volume, and momentum all align. Exit fast when they stop aligning. Keep position count low. Never chase. Never override stops.

The goal is not to catch every move — it is to be right often enough, size correctly, and cut losses before they compound.

### Approved Universe

Only the following symbols may be traded. No exceptions.

| Symbol | Name | Sector |
|--------|------|--------|
| SPY | SPDR S&P 500 ETF | Broad market |
| QQQ | Invesco Nasdaq-100 ETF | Technology / growth |
| IWM | iShares Russell 2000 ETF | Small cap / risk proxy |
| DIA | SPDR Dow Jones Industrial ETF | Blue chip |
| XLF | Financial Select Sector SPDR | Financials |
| XLE | Energy Select Sector SPDR | Energy |
| XLK | Technology Select Sector SPDR | Technology |
| XLV | Health Care Select Sector SPDR | Health care |
| XLI | Industrial Select Sector SPDR | Industrials |
| XLY | Consumer Discretionary Select Sector SPDR | Consumer discretionary |

### Constraints Summary

| Parameter | Value |
|-----------|-------|
| Max open positions | 3 |
| Max capital deployed | 75% of portfolio |
| Venue | Alpaca Paper Trading only |
| Overnight holding | Disabled by default |

---

## 2. Entry Criteria

A BUY signal is valid only when **all six conditions below are simultaneously true** at the time of evaluation. Partial alignment is not sufficient — do not enter.

| # | Condition | Requirement |
|---|-----------|-------------|
| 1 | Trend filter 1 | Price > 20-day SMA |
| 2 | Trend filter 2 | Price > 50-day SMA (confirms established uptrend) |
| 3 | Breakout trigger | Today's price broke above the 5-day high (i.e. current price > highest close of the prior 5 trading days) |
| 4 | Volume confirmation | Today's volume >= 1.1× the 20-day average volume |
| 5 | RSI filter | RSI(14) is between 50 and 75 (inclusive) |
| 6 | Position check | No existing open position in this symbol |

### Entry Notes
- All indicator values are computed on **daily bars**.
- The 5-day high is the highest **closing price** of the 5 trading days immediately before today. Intraday highs are not used.
- RSI cap of 75 avoids entering overbought conditions where reversal risk is elevated.
- If a signal is valid at 09:35 ET but the price has already moved more than **3% above the breakout point**, do not enter (see Section 7 — no chasing).

---

## 3. Exit Criteria

Close a position when **any one** of the following conditions is met. Conditions are checked in order; the first triggered exits the position.

| Priority | Exit Rule | Condition |
|----------|-----------|-----------|
| 1 | Hard stop loss | Price falls 2% below the entry price |
| 2 | Trailing stop | Price falls 3% below the position's high watermark (highest price reached since entry) |
| 3 | Take profit | Price reaches +5% above entry price |
| 4 | Trend break | Price closes below the 20-day SMA |
| 5 | EOD close | Market close routine at 16:10 ET — all positions closed regardless of P&L unless `hold_overnight` config is explicitly set to `true` |

### Exit Notes
- **Hard stop (priority 1) overrides everything.** It cannot be skipped, adjusted, or delayed.
- The trailing stop high watermark updates continuously during the session — it tracks the highest observed price since entry, not just end-of-day prices.
- Trend break (priority 4) is evaluated at the close of each daily bar, not intraday.
- If multiple exit conditions trigger simultaneously, the highest-priority rule governs.
- Do not re-enter a symbol on the same trading day after exiting it.

---

## 4. Position Sizing

### Standard Sizing

| Rule | Value |
|------|-------|
| Base position size | 25% of **available cash** at time of order |
| Maximum per symbol | 30% of **total portfolio value** |
| Maximum total deployed | 75% of total portfolio value (3 positions × 25%) |
| Cash floor | If cash < 10% of total portfolio value, do not open new positions |

### Sizing Logic (step by step)

1. Calculate available cash at order time.
2. Calculate 25% of that available cash — this is the intended order value.
3. Check: would this position exceed 30% of total portfolio? If yes, cap at 30%.
4. Check: is remaining cash after the order >= 10% of total portfolio? If no, reduce or skip.
5. Convert order value to shares: `shares = floor(order_value / current_ask_price)`.
6. If resulting share count is 0, do not place the order.

### Position Count Gate

Never open a new position when there are already 3 open positions. The count check happens before all other entry logic.

---

## 5. Market Conditions to Avoid

The agent must **not open new positions** when any of the following conditions is detected. Existing positions may still be managed (stops honored, exits executed).

| Condition | Threshold / Definition |
|-----------|----------------------|
| VIX elevated | VIX > 30 at time of evaluation |
| Earnings proximity | It is an earnings release day for any of the ETF's top 3 holdings |
| Market open buffer | Current time is between 09:30 and 09:35 ET (first 5 minutes) |
| Pre-close window | Current time is between 15:40 and 16:00 ET (last 20 minutes before close) |
| Market half-day | The session is a scheduled half-day (early close at 13:00 ET) |

### Condition Notes
- VIX is checked once at the start of the market-open routine and again at midday. If VIX crosses above 30 intraday, no new entries for the remainder of that session.
- The pre-close window (15:40–16:00) applies to **order placement**. The EOD close routine at 16:10 still executes to close all positions.
- On half-days, execute the close routine at 12:50 ET instead of 16:10 ET.

---

## 6. Routine Responsibilities

The agent operates on a fixed daily schedule. Each routine has a defined scope — do not perform actions outside that scope.

| Routine | Time (ET) | Permitted Actions |
|---------|-----------|-------------------|
| `premarket` | 08:30 | Compute indicators, build watchlist, identify candidate setups, check VIX level. **No order placement.** |
| `market-open` | 09:35 | Evaluate watchlist against all entry criteria. Execute approved BUY orders. Check market conditions gate first. |
| `midday` | 12:30 | Adjust trailing stop watermarks, check existing positions against exit criteria. Open new positions only if a strong setup exists **and** VIX allows. |
| `close` | 16:10 | Close all open positions. Generate EOD report (see Section 8). |
| `weekly` | Fri 16:30 | Review strategy drift, performance metrics, and signal quality. **No trades.** |

### Routine Execution Order (market-open)

1. Check position count — if 3 open, skip to exit checks only.
2. Check market condition gates — if any trigger, skip entry evaluation.
3. For each symbol on watchlist, evaluate all 6 entry criteria.
4. Log decision for each symbol evaluated (see Section 8).
5. For symbols passing all criteria, apply position sizing.
6. Place orders.

---

## 7. What the Agent Must NOT Do

These are hard prohibitions. No exceptions, no overrides.

| Prohibition | Detail |
|-------------|--------|
| Partial entry | Do not open a position without all 6 entry criteria passing. |
| Stop override | Do not skip, delay, or modify the 2% hard stop once set. |
| Chasing momentum | Do not enter if price has already moved more than 3% above the breakout point at time of evaluation. |
| Off-list trading | Do not trade any instrument not listed in Section 1. No alternatives, no substitutes. |
| Pre-close orders | Do not place new orders between 15:40 and 16:00 ET. |
| Overnight holding | Do not hold positions overnight unless `hold_overnight` is explicitly set to `true` in agent config. Default is `false`. |
| Discretionary override | Do not interpret market sentiment, news, or other qualitative signals to override quantitative criteria. |

---

## 8. Decision Log Format

Every symbol evaluated during any routine must produce a decision log entry. This applies to both go and no-go decisions.

### Required Fields

| Field | Description |
|-------|-------------|
| `timestamp` | ISO 8601 datetime with timezone (ET) |
| `routine` | Which routine triggered the evaluation (`premarket`, `market-open`, `midday`) |
| `symbol` | Ticker evaluated |
| `criteria` | Object listing each of the 6 entry criteria with `pass` / `fail` and the observed value |
| `market_gates` | List of market condition checks and their status at evaluation time |
| `decision` | `BUY` / `NO_GO` / `HOLD` / `EXIT` |
| `rationale` | One sentence explaining the final decision |
| `order_id` | Alpaca order ID if an order was placed, otherwise `null` |

### Example Log Entry (JSON)

```json
{
  "timestamp": "2026-04-17T09:37:14-04:00",
  "routine": "market-open",
  "symbol": "QQQ",
  "criteria": {
    "price_above_sma20": { "result": "pass", "price": 442.10, "sma20": 435.60 },
    "price_above_sma50": { "result": "pass", "price": 442.10, "sma50": 428.90 },
    "breakout_above_5d_high": { "result": "pass", "price": 442.10, "5d_high": 440.80 },
    "volume_confirmation": { "result": "pass", "volume": 38200000, "avg20_volume": 34000000, "ratio": 1.12 },
    "rsi_in_range": { "result": "pass", "rsi14": 61.4, "min": 50, "max": 75 },
    "no_existing_position": { "result": "pass" }
  },
  "market_gates": {
    "vix_below_30": { "result": "pass", "vix": 18.4 },
    "not_earnings_day": { "result": "pass" },
    "not_open_buffer": { "result": "pass" },
    "not_pre_close": { "result": "pass" },
    "not_half_day": { "result": "pass" }
  },
  "decision": "BUY",
  "rationale": "All 6 entry criteria passed and no market condition gates triggered; entering at breakout above 5-day high with volume confirmation.",
  "order_id": "a1b2c3d4-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

### Example No-Go Entry

```json
{
  "timestamp": "2026-04-17T09:38:02-04:00",
  "routine": "market-open",
  "symbol": "XLE",
  "criteria": {
    "price_above_sma20": { "result": "pass", "price": 91.50, "sma20": 89.20 },
    "price_above_sma50": { "result": "pass", "price": 91.50, "sma50": 87.40 },
    "breakout_above_5d_high": { "result": "fail", "price": 91.50, "5d_high": 92.10 },
    "volume_confirmation": { "result": "pass", "volume": 12800000, "avg20_volume": 11200000, "ratio": 1.14 },
    "rsi_in_range": { "result": "pass", "rsi14": 58.2, "min": 50, "max": 75 },
    "no_existing_position": { "result": "pass" }
  },
  "market_gates": {
    "vix_below_30": { "result": "pass", "vix": 18.4 }
  },
  "decision": "NO_GO",
  "rationale": "Breakout criterion failed — price has not exceeded the 5-day high of 92.10.",
  "order_id": null
}
```

---

## 9. Configuration Reference

| Config Key | Default | Description |
|------------|---------|-------------|
| `hold_overnight` | `false` | Allow positions to be held past EOD close |
| `max_positions` | `3` | Maximum concurrent open positions |
| `position_size_pct` | `0.25` | Fraction of available cash per trade |
| `hard_stop_pct` | `0.02` | Hard stop distance from entry (2%) |
| `trailing_stop_pct` | `0.03` | Trailing stop distance from high watermark (3%) |
| `take_profit_pct` | `0.05` | Take profit target from entry (5%) |
| `vix_threshold` | `30` | VIX level above which no new entries are made |
| `breakout_chase_limit_pct` | `0.03` | Maximum allowable distance above breakout before rejecting entry |
| `cash_floor_pct` | `0.10` | Minimum cash ratio; below this, no new positions |

---

*This document governs all trading decisions made by the autonomous agent. Any deviation from these rules constitutes a strategy violation and must be logged.*
