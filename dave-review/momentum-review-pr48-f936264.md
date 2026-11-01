# Review PR 48 (Momentum shadow tick M2/M3/M5/M6) op f936264 (squash op main)

Reviewer: Dave · Techniek · 2026-11-01 17:25 CET (Amsterdam)
Repro's en logs: /workspace/dave/momentum-1101-1709/ (ook op branch dave/pr47-repros onder dave-review/momentum-1101/)

## Verdict: GREEN (voor het zetten van de schaduwvlaggen), met volgpunten. Geen blockers.

Kanttekening proces: PR 48 is zonder review van Dave op main gezet (f936264). Daarna ook PR 50 (83bcf4c, 17:10 CET), ook zonder review. Railway trader-dashboard heeft `checkSuites: false` en bouwt elke push op main direct (deploy 97f1ad4c SUCCESS 17:10 CET).

## CI op de exacte head
- f936264 zelf heeft 0 check runs (squash-commit op main; main draait geen CI). De tree van f936264 is identiek aan PR-head 631b91d (tree 55583e11, `git rev-parse f936264^{tree} 631b91d^{tree}`).
- 631b91df: `guard unit tests` success (124899818727), `typecheck, lint & build (web)` success (124899915425). Niets pending.
- Lokaal op f936264, root `npm test` zonder web/node_modules: 371/371 groen (logs-m48/root-test-serial.log, eerste regel "web/node_modules absent"). tsc 0, lint 0, build 0 (met web deps). De eerste parallelle run had 1 time-out in web/lib/crypto/repro-close-flat-qty-available.test.ts door CPU-druk (drie suites tegelijk); serieel groen.
- Huidige main 83bcf4c: 0 check runs (zelfde reden).

## Vraag 1: kunnen MOMENTUM2/3/5/6_ENABLED ooit een order plaatsen bij ongewijzigde DRY_RUN?
Nee. Bewezen op twee manieren.

Statische trace (f936264):
- web/app/api/scheduler/tick/route.ts → runSchedulerTick (web/lib/scheduler-service.ts) → runMomentumTick (web/lib/momentum-tick.ts:30) → RUNNERS (momentum-tick.ts:13) = runMomentum2/3/5/6. Alleen deze vier; momentum4 staat er niet in en decideDueMomentum (src/scheduler/decide-momentum.ts) kent geen momentum4.
- Elke runner begint met de mode-check: M2 resolveMomentum2Mode (src/momentum2/mode.ts:10), M3/M5/M6 resolveShadowMode (mode.ts:19). ENABLED≠'1' → skip. DRY_RUN==='0' → weigeren (skip). Anders shadow:true.
- Elke runner geeft executeDay `shadowBroker(lastPrice)` (web/lib/momentum2/run.ts, momentum3/run.ts, momentum5/run.ts:50, momentum6/run.ts). shadowBroker doet geen netwerk.
- `alpacaPaperBroker` (web/lib/momentum2/broker.ts, de enige plek met alpaca.placeOrder/cancelOrder/openOrders/orders) wordt op main nergens geïmporteerd (`rg alpacaPaperBroker` = alleen de definitie).
- Alpaca-aanroepen op deze paden zijn alleen lezend: alpaca.clock (M2/M3/M5), alpaca.latestQuotes (M2), GET data.alpaca.markets stock/crypto bars.
- decideDay krijgt geen broker. Schrijven gaat alleen naar Postgres: settings (boeken/pending per sleutel, upsertDropLegacy DELETE gebonden op `key = $1`, web/lib/momentum2/store.ts) en momentum2_log (INSERT). routine_runs/routine_run_locks gebonden op (routine, slot_key).
- Schaduwboeken hebben real≠true, dus foreignQtyFromRealBooks negeert ze; M1-eigendom (eod-flatten) wordt niet geraakt.

Dynamisch bewijs: repros/dave-pr48-tick-e2e.test.ts (log pr48-tick-e2e-raw.log). Echte runMomentumTick + echte runMomentum2/3/5/6 + echte routine-runs.ts en momentum2/store.ts op pglite (started_at komt als Date terug), Alpaca-client als verklikker (elke methode buiten clock/latestQuotes/calendar wordt vastgelegd en faalt), global fetch als verklikker (elke niet-GET naar *.alpaca.markets faalt). Bars zijn alleen zichtbaar tot de nep-klok, zoals bij Alpaca.
- S1: alle vier ENABLED=1, plus MOMENTUM4_ENABLED=1 en MOMENTUM4_DRY_RUN=0. Tikken over ma 2 nov 00:30 UTC t/m di 3 nov 15:45 UTC. Resultaat: orderCalls = [], alleen clock en latestQuotes plus GET bars; 11 runs ok (M6 run, M2/M3/M5 execute en decide, volgende dag execute), geen momentum4-run, elke logregel shadow:true. PASS.
- S2: ENABLED=1 en DRY_RUN=0 voor alle vier: elke run 'skipped' met "echte orders zijn in deze versie geblokkeerd", orderCalls = []. PASS.

## Vraag 2: M4
Niet aan te zetten via deze vlaggen: geen runner, geen job in decideDueMomentum. S1 bewijst dat MOMENTUM4_ENABLED=1 niets doet.

## Vraag 3: secret header en ma t/m vr
- Secret: middleware laat /api/scheduler/ door zonder cookie; de route roept requireCronAuth → verifyCronBearer (src/security/production-auth.ts) aan: `Authorization: Bearer ${CRON_SECRET}`. Live gecontroleerd: POST zonder header op productie → 401 (er draaide niets). Kanttekeningen: vergelijking met `===` (niet constant-time); zonder CRON_SECRET buiten productie open; de route accepteert `body.nowMs` van een geautoriseerde aanroeper (wie de secret heeft kan de klok verzetten). Geen blocker, wel volgpunt.
- Ma t/m vr: ONJUIST. Railway service scheduler-tick heeft cronSchedule `*/5 * * * *` (elke dag). DEPLOY.md zegt `*/5 * * * 1-5` en is verouderd. Bewijs live: `[momentum-tick] momentum6-run 2026-11-01 skipped schaduw {"decide":{"skipped":"MOMENTUM6_ENABLED staat niet aan"},...}` om 17:05 en 17:10 CET op zondag. Voor M6 (crypto, elke UTC-dag) is 7 dagen juist nodig; de ETF-stappen worden door de kalender/sessiegrenzen in decideDueMomentum tegengehouden. Dus: geen blocker, maar Cosmo's claim "draait alleen ma–vr" klopt niet en DEPLOY.md moet worden bijgewerkt. Zet de cron NIET op 1-5, dan mist M6 de weekenddagen.

## Vraag 4: risico main
- Volgorde: PR 48 (f936264) en daarna PR 50 (83bcf4c) staan op main; 83bcf4c heeft dezelfde tree als PR-head 035b4ef3. Geen conflicten tussen 48 en 50. Main deployt (97f1ad4c SUCCESS).
- PR 47 op nieuwe main: `git merge-tree origin/main 9fc1954c` schoon (tree dff84d9). MAAR: dan roept de tick PR 47's runMomentum5/6 aan, en die kennen resolveMomentumPaperMode: MOMENTUM5/6_ENABLED=1 + DRY_RUN=0 = papierorders via de tick. Bewezen op lokale merge-preview b3b2c64 (niet gepusht): S1 blijft groen (alleen ENABLED=1 → nul orders), S2 faalt: de tick gaat de papierbroker in (alpaca.openOrders aangeroepen), logregel zegt nog steeds "schaduw" (momentum-tick.ts:77 hardcodeert "schaduw"). Zie review PR 47 (B4).
- PR 50 op main toont M2..M6 status via resolveShadowMode: na PR 47 zou M5/M6 met DRY_RUN=0 "GEBLOKKEERD" tonen terwijl er papierorders lopen. Ook PR 47 B4.

## Exacte Railway-variabelen (service trader-dashboard, env production) voor alleen schaduw
Nu bestaan er geen MOMENTUM*-variabelen (namen gelezen, niet de waarden). Zetten:
- MOMENTUM2_ENABLED=1
- MOMENTUM3_ENABLED=1
- MOMENTUM5_ENABLED=1
- MOMENTUM6_ENABLED=1
NIET zetten: MOMENTUM2_DRY_RUN, MOMENTUM3_DRY_RUN, MOMENTUM5_DRY_RUN, MOMENTUM6_DRY_RUN (laten ontbreken; "0" laat op main de strategie weigeren, en ná PR 47 betekent "0" bij M5/M6 papierorders). Geen MOMENTUM4_*. Niets op service scheduler-tick wijzigen.
Let op: DEEPSEEK_API_KEY staat op trader-dashboard, dus M2 decide doet een DeepSeek-veto-aanroep (LLM-kosten, geen order).
Let op: een variabele zetten op Railway triggert een nieuwe deploy van trader-dashboard (normaal gedrag, geen redeploy-tool nodig).

## Logregels om te verwachten (Railway logs trader-dashboard), tijden Amsterdam (CET)
- M6, eerste tick na 00:30 UTC (01:30 CET): `[momentum-tick] momentum6-run 2026-11-02 ok schaduw {"decide":{"date":"2026-11-01","shadow":true,"planned":N},"execute":{"date":"2026-11-01","shadow":true,"trades":N}}`
- ETF execute vanaf open+15m (ma 2 nov 15:45 CET): `[momentum-tick] momentum2-execute 2026-11-02 ok schaduw {"execute":{"date":"2026-11-02","shadow":true,"trades":N}}`, idem momentum3-execute en momentum5-execute.
- ETF decide vanaf close+20m (ma 2 nov 22:20 CET): `[momentum-tick] momentum2-decide 2026-11-02 ok schaduw {"decide":{"date":"2026-11-02","shadow":true,"planned":N}}`, idem momentum3-decide en momentum5-decide. Als de slotbar nog niet binnen is: `... skipped schaduw {"decide":{"skipped":"geen slotbar ..."}}`, maximaal 6 pogingen.
- Fout: `[momentum-tick] <routine> <dag> failed: <melding>`.
- Als je ooit `"shadow":false` of een Alpaca-orderfout ziet bij deze routines: vlaggen direct weer weg.

## Volgpunten (geen blocker voor de vlaggen)
1. DEPLOY.md: cron is `*/5 * * * *` (7 dagen), niet `1-5`. Claim in thread corrigeren.
2. momentum-tick.ts:77 hardcodeert "schaduw" en momentum-tick.ts:12 zegt "geen pad naar echte orders": wordt onwaar zodra PR 47 landt (zie PR 47 B4).
3. M2/M5 decide: maximaal 6 pogingen × 5 min na close+20m; komt de slotbar later, dan is die dag verloren. M3 decide geeft ok terug ook als de ETF-deel skipt (out.etf={skipped}); daardoor geen nieuwe poging.
4. M6 execute gebruikt de ET-datum, decide de UTC cryptoDate (zie logregel: dayKey 2026-11-02, date 2026-11-01). Werkt, maar verwarrend in logs.
5. PR 48-tests mocken routine runs met ISO-strings; mijn pglite-repro met echte Date-rijen is groen (normalizeRoutineRunRow zet Date om). Voeg zo'n test toe aan de suite.
6. verifyCronBearer constant-time maken; `body.nowMs` alleen buiten productie accepteren.
7. assetClassForRoutine labelt momentum6-run als 'etf' (cosmetisch).
