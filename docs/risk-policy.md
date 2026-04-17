# Risk Policy — Autonomous Paper Trading Agent

**Version:** 1.0  
**Last updated:** 2026-04-17  
**Scope:** Paper trading only. All rules apply equally to live trading if/when promoted.

---

## 1. Overview

This document defines the hard limits enforced by the trading agent's guard layer. These rules exist outside the LLM. They cannot be reasoned around, overridden at runtime, or bypassed by any instruction the LLM generates.

### Execution order — always, no exceptions

```
LLM proposes trade
       ↓
validate-trade.ts     — strategy conformance
       ↓
portfolio-limits.ts   — position and size limits
       ↓
circuit-breakers.ts   — drawdown and abuse protection
       ↓
TRADING_ENABLED check  — kill switch
       ↓
Order submitted
```

If any step fails: the trade is **rejected**, the reason is **logged**, and **no order is placed**. The LLM is not consulted again for that proposal.

---

## 2. Portfolio Limits (`portfolio-limits.ts`)

Evaluated before every order. All checks must pass.

| Limit | Value | Notes |
|---|---|---|
| Max open positions | 3 | Hard cap. A 4th position is always rejected. |
| Max single position size | 30% of total equity | Prevents concentration in one symbol. |
| Min cash reserve | 10% of total equity | Buffer always maintained. Order is rejected if it would breach this. |
| Max daily trades | 10 | Resets at market open each trading day. |
| Max order size (single trade) | $30,000 | Absolute dollar cap regardless of equity. |
| Min order size | $500 | Rejects micro-trades that generate noise without edge. |

**Calculation notes:**

- "Total equity" = cash + market value of all open positions at last known price.
- "Daily trades" = all submitted orders (filled or not) since 09:30 ET on the current trading day.
- Position size check uses the proposed order value at the time of submission.

---

## 3. Strategy Validation (`validate-trade.ts`)

Confirms the proposed trade conforms to the strategy definition. A trade that passes portfolio limits but fails strategy validation is still rejected.

### Approved symbol whitelist

Only the following ETF tickers are accepted:

```
SPY  QQQ  IWM  DIA
XLF  XLE  XLK  XLV
GLD  TLT
```

Any other symbol is rejected regardless of stated rationale.

### Field-level rules

| Field | Rule |
|---|---|
| `symbol` | Must be on the whitelist above. |
| `side` | Must be `'buy'`. Short selling is not permitted in this strategy. |
| `strategyTag` | Must be exactly `'momentum-breakout'`. |
| `orderType` | Must be `'market'` or `'limit'`. Stop orders as primary entry are not allowed. |
| `quantity` | Must be a positive whole number (integer > 0). ETF shares are not fractional. |
| Duplicate check | No open or pending order may already exist for the same symbol. One position per symbol at a time. |

---

## 4. Circuit Breakers (`circuit-breakers.ts`)

These conditions halt **all trading for the remainder of the trading day**. They evaluate state continuously — not only at order time.

| Trigger | Threshold | Action |
|---|---|---|
| Daily drawdown | Portfolio value drops > 3% below day-start equity | Stop all trading |
| Consecutive losses | 3 closed losing trades in a row | Stop all trading |
| Rapid order submission | > 5 orders submitted within any 10-minute window | Stop all trading |
| Peak drawdown | Portfolio value drops > 5% below session peak equity | Stop all trading |

### State after a circuit breaker trips

1. `circuitBreakerTripped` is set to `true` in portfolio state.
2. `circuitBreakerReason` is set with a human-readable description of which trigger fired and at what value.
3. The timestamp of the trip is recorded in `circuitBreakerTrippedAt`.
4. No new orders can be submitted until the flag is manually cleared.

### Manual reset procedure

Circuit breakers do **not** reset automatically. Reset is intentional and human-initiated:

1. Review logs for the session to understand what triggered the breaker.
2. If satisfied the cause is understood and mitigated, set `TRADING_ENABLED=true` in Railway environment variables.
3. The flag resets at the start of the next trading day if re-enabled.

---

## 5. Kill Switch

| Variable | Behavior |
|---|---|
| `TRADING_ENABLED=true` | Trading is active (default for live sessions). |
| `TRADING_ENABLED=false` | All order submission is halted instantly. |

The kill switch is checked **before every order**, after all other guards have passed. It is the final gate. Setting it to `false` in Railway environment variables takes effect on the next order attempt — no restart required.

Use cases:
- Unexpected market events (halt, flash crash, geopolitical shock).
- Suspected agent misbehavior.
- End-of-week manual shutdown.
- Any situation where you want zero risk of new orders without touching code.

---

## 6. Logging Requirements

Every guard evaluation — pass or fail — must produce a structured log entry. Partial logging is not acceptable.

### Required fields per log entry

| Field | Type | Description |
|---|---|---|
| `timestamp` | ISO 8601 string | UTC time of evaluation. |
| `guardModule` | string | One of: `validate-trade`, `portfolio-limits`, `circuit-breakers`, `kill-switch`. |
| `tradeProposalId` | string | Unique ID of the proposed trade being evaluated. |
| `result` | `'PASS'` or `'FAIL'` | Outcome of this guard. |
| `failReasons` | string[] | Non-empty if result is FAIL. Each entry is a specific, actionable reason. |
| `warnings` | string[] | Non-blocking observations (e.g. "position size at 28% — near limit"). |

### Log storage

- All guard evaluations are appended to the session log file.
- Logs are never deleted automatically.
- Circuit breaker trips are also written to a separate `circuit-breaker-events.log` for fast review.

---

## 7. No Exceptions Policy

These rules are not advisory. They are not guidelines. They are enforced by code.

**The LLM cannot:**
- Request an override of any hard limit.
- Claim "special market conditions" to justify bypassing a guard.
- Adjust risk parameters at runtime through conversation or tool use.
- Re-submit a rejected trade without the underlying condition being resolved.

**The LLM can:**
- Propose a different trade that conforms to all rules.
- Log a note explaining why it believes the limit should be reconsidered (for human review later).
- Report that a circuit breaker has tripped and explain why.

**Parameter changes require:**
- A code change in the relevant guard module.
- A deployment to Railway.
- Human review of the diff before deployment.

There is no runtime path to change these rules.

---

## 8. Risk Parameters via Environment

The following limits can be adjusted by changing Railway environment variables without a code deployment. All other limits are hardcoded and require a code change.

```env
# Maximum allowed daily drawdown as a percentage of day-start equity
MAX_DAILY_DRAWDOWN_PCT=3

# Maximum number of concurrent open positions
MAX_POSITIONS=3

# Maximum size of a single position as a percentage of total equity
MAX_POSITION_SIZE_PCT=30
```

**Important:** Loosening these values increases risk. Any increase beyond the defaults requires explicit sign-off before deployment.

All other limits (order size caps, whitelist, strategy tag, circuit breaker thresholds) are hardcoded in the respective guard modules and cannot be changed without a code deployment.
