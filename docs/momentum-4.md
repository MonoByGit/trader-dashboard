# Momentum 4 — kopiëren (13F), alleen schaduw

Bovenop het raamwerk van PR 37/42. Versie `m4-copy`: 5% paperkapitaal, harde stop 8%, trailing 10%, verlieslimiet 15% van het eigen budget, max 10 posities, hele aandelen. Prefix `m4-`/`m4s-`; M1 EOD-flatten raakt ze niet. `MOMENTUM4_DRY_RUN=0` wordt geweigerd; uit tenzij `MOMENTUM4_ENABLED=1`.

## Vertraging (eerlijk)

| Bron | Wat je ziet | Typische vertraging t.o.v. de trade |
| --- | --- | --- |
| **SEC 13F** | Kwartaalholdings na publicatie | Rapportperiode eindigt → filing tot **45 dagen** later; backtest gebruikt **filedAt**, niet `asOf`. |
| Congres (STOCK Act) | Periodic transaction reports | Tot **45 dagen** na de trade. |

## Bronnen

| Bron | Besluit |
| --- | --- |
| **SEC EDGAR 13F** | **Gebruikt.** Officiële JSON/XML via `data.sec.gov` en `www.sec.gov/Archives`. User-Agent `MonoTrader studio@monobydusty.com`, ≥120 ms tussen requests, in-memory cache in runs. |
| **Congres (House Clerk + Senate eFD)** | **Niet gebruikt.** Senate eFD vereist acceptatie van voorwaarden; 5 U.S.C. app. §105(c) verbiedt commercieel gebruik (behalve nieuwsmedia). Dit product valt daar niet onder → geen geautomatiseerde fetch, geen scraping. |
| eToro / ARK CSV | **Vallen af** (keys, robots.txt / geen auto-fetch). |

CUSIP→US-ticker voor Alpaca-universe: OpenFIGI (gratis mapping, geen signaalbron), agressief gecached.

## Fondsen

- **Backtest mandje (low turnover):** 7 fondsen in `M4_BASKET_LOW_TURNOVER` — Berkshire, Baupost, Gardner Russo, Yacktman, Wedgewood, Davis, Torray (CIK + rationale in `src/momentum4/funds.ts`).
- **Live refresh (breder):** `M4_13F_FUNDS` incl. Pershing Square, Duquesne, Third Point (hogere turnover; niet in het low-turnover mandje).

## Varianten (backtest)

| Variant | Gedrag |
| --- | --- |
| `diff` | Eén fonds (Berkshire): kopieer 13F-wijzigingen (open/add/reduce/close). |
| `basket` | Mandje: top-N holdings (`--max-names`), **conviction** (som gewicht%) of **equal** (`--basket-weight`). Alleen Alpaca-tradable tickers na CUSIP→FIGI. |
| `new-only` | Mandje-diff maar alleen **open**; geen verkoop op 13F-close/reduce. |

Signalen op `filedAt`, weekend → volgende SPY-sessie; besluit close die dag, fill open D+1 (simulate/live).

## Code

- `holdings.ts` — diff, signalen op `filedAt`
- `edgar.ts` — listings, 13F XML, fetch met fair access
- `plan.ts` — besluit op filing-dag, uitvoering open D+1 (via simulate/live)
- `walkforward.ts` — out-of-sample parameterkeuze + test
- Schaduw-API: `POST /api/momentum4/run` `{ "step": "refresh" | "decide" | "execute" }`

## Backtest

```bash
export ALPACA_API_KEY=... ALPACA_SECRET_KEY=...
npx tsx scripts/run-momentum4.ts --from=2020-01-01 --to=2025-06-30 \
  --variant=all --max-names=10 --basket-weight=conviction
```

Caches (EDGAR snapshots + bars) optioneel: `--snapshots-cache`, `--bars-cache`.

Walk-forward OOS: 504d train / 252d test; diff/new-only grid op `minAddPct`/`positionPct`; mandje vast. Kosten: 2 bps slippage + 1 bps fee. Tabel: rendement vs SPY, max DD (strategie + SPY), Sharpe, trades, kosten.
