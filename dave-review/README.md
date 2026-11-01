# dave-review: PR 47 reviewmateriaal (Dave · Techniek)

Overdracht aan Cosmo. Alleen reviewmateriaal, geen productiecode. Basis: `cursor/m5-m6-safety-layer-beba` @ 5a9342299023a8cb8d6b6032c365fded586c8029.
Deze map valt buiten de jest `roots` (`src`, `web`), dus `npm test` en CI pakken hem niet op.

## pr47/reviews/
- `pr47-review-36f1e1c.md`: review van de eerste head 36f1e1c.
- `pr47-review-a6fcc52.md`: review van a6fcc52 (NIET GROEN, 6 blockers).
- `pr47-review-5a93422.md`: review van 5a93422 (NIET GROEN, 2 blockers: P1 en P3/P3b).

## pr47/v2/ (geschreven tegen a6fcc52)
- `dave-pr47-*.test.ts`: jest repro tests met nep-Alpaca (broker, crypto-m1, flip, live, misc, mode, a2).
- `repro-run.log`: uitvoer van de run op a6fcc52.

## pr47/v3/ (geschreven tegen 5a93422)
- Zelfde tests, bijgewerkt, plus `dave-pr47-int.test.ts`: integratie met de echte broker en een nep-Alpaca client. Bevat repros P1 (pending_cancel > 3 s), P3 en P3b (503 op GET /orders tijdens pollen) en I3 (crypto fee).
- `repro-run.log`: opgeschoonde uitvoer op 5a93422. `raw-run.log`: ruwe uitvoer.

## bull-logs/
- `m56-*.txt`: Bulls M5/M6 backtest en diagnose logs (run, run2, run3, diag, diag2, diag3, iso, s7-research-trades).
- `ui-survey.md`: Bulls inventaris van de huidige web UI (pagina's, API routes, auth) als basis voor het dashboard.

## Tests draaien
De tests gebruiken relatieve imports vanaf `web/lib/momentum2/__dave/`. Kopieer ze daarheen en draai jest:

```
mkdir -p web/lib/momentum2/__dave && cp dave-review/pr47/v3/*.test.ts web/lib/momentum2/__dave/
npm test -- web/lib/momentum2/__dave
```

Voor v2: zelfde, met `dave-review/pr47/v2/*.test.ts`. Root `node_modules` en `web/node_modules` moeten geinstalleerd zijn (web heeft `pg`).
Haal `web/lib/momentum2/__dave/` daarna weer weg; commit hem niet.

Verwacht op 5a93422 (v3): 41 groen, 3 rood (P1, P3, I3). Die 3 zijn de open blockers.
