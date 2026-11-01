# Review PR 47 (trader-dashboard), head 5a9342299023a8cb8d6b6032c365fded586c8029

**Oordeel: NIET GROEN** op 5a9342299023a8cb8d6b6032c365fded586c8029 (branch cursor/m5-m6-safety-layer-beba, base main 1286950).

Twee blockers, beide met repro: een positie die een hele sessie zonder stop staat (B1) en een dubbele buy met een positie zonder stop (B2). De zes blockers van a6fcc52 zijn weg: mijn v2 set draait groen op deze head.

## 1. CI op exact deze sha (zelf nagekeken via GitHub)
* Run 41320906908.
* guard unit tests, check 124890704073: success (16:22:35 tot 16:22:59 CET).
* typecheck, lint & build (web), check 124890814514: success (16:23:01 tot 16:23:50 CET).

## 2. Lokaal (worktree /workspace/dave/pr47/wt3 op 5a93422)
* Root npm test zonder web/node_modules, met --detectOpenHandles: 111 suites, 395 tests groen. Geen Force exiting, geen open handles. (Cosmo meldde 394, het zijn er 395.)
* web: tsc exit 0, lint 0 warnings, build compiled successfully.
* Logs: /workspace/dave/pr47/v3-root-test.log, v3-web-tsc.log, v3-web-lint.log, v3-web-build.log.

## 3. Repro's (/workspace/dave/pr47/v3, log v3/repro-run.log): 44 tests, 41 groen, 3 rood
De v2 set (34 plus A2) is alleen aangepast aan nieuwe contracten, de eisen zijn niet verzwakt:
* broker mock kreeg replaceOrder met Alpaca regels: nieuwe order, oude 'replaced', geen replace in accepted/pending_*, reservering van de oude telt niet, unieke client_order_id;
* K2 telt nu open stops in plaats van placeOrder calls;
* nep rekening: positionQty is account qty (nieuw contract), listOpenStops qty is de rest, cancelStop geeft een outcome;
* R2 verwacht het extra veld failed: [];
* F2 krijgt expectReal: false, zoals run.ts dat in schaduw doorgeeft.

Nieuw in v3: dave-pr47-int.test.ts. Dit draait executeDay en reconcile door de echte makeAlpacaPaperBroker, met mijn eigen nep Alpaca client. Die modelleert: reservering, 403/422, PATCH regels, pending_cancel, crypto fee en tijdelijke GET fouten.

| Repro | a6fcc52 | 5a93422 |
|---|---|---|
| N1, N1b, N2, N2b, N3, N5 (exit/stop onder reservering, M1 BTC) | rood | groen |
| L1b (gevulde buy niet opnieuw) | rood | groen |
| L8 (partial stop over twee runs) | rood | groen |
| F2 (schaduw schrijft niet in echt boek) | rood | groen |
| A2 (niet ASCII bearer) | rood | groen |
| Rest v2 (K1 tot K5, L1 tot L7, R1, R2, F1, C1, D1, B1, T1, A1, O1, MX1 tot MX5) | groen | groen |
| I1, I2, I4, I5 (zelfde eisen via echte broker) | n.v.t. | groen |
| P2 (raise op 'accepted' stop: oude stop blijft) | n.v.t. | groen |
| P4 (crypto PATCH fractionele qty geweigerd: oude stop blijft) | n.v.t. | groen |
| **P1** pending_cancel bij exit | n.v.t. | **rood (B1)** |
| **P3 / P3b** buy gevuld, GET faalt tijdens pollen | n.v.t. | **rood (B2)** |
| I3 crypto fee: M6 stop 0,06 op 0,05985 eigen BTC | n.v.t. | rood (follow up, geen blocker) |

Mode matrix (144 combinaties, MX1 tot MX5), paper host (ook de nieuwe PATCH roept assertAlpacaPaperTrading aan), schaduw nul calls en cron auth (A1, A2): allemaal groen.

## 4. Blockers

### B1. Positie een hele sessie zonder stop als Alpaca de stop cancel in pending_cancel houdt
* Waar: src/momentum2/live.ts:363 tot 374 (outcome timeout: exit uitgesteld, dan ensureStop) en src/momentum2/alpaca-paper-broker.ts:49 en 115 tot 121 (pending_cancel telt niet als eigen open stop).
* Repro: dave-pr47-int.test.ts "P1".
* Wat er mis is: de exit annuleert de GTC stop. Alpaca kan die cancel tientallen seconden in pending_cancel houden (Alpaca forum; awaitStopOrderCanceled wacht 12 x 250 ms). Dan:
  * de exit wordt uitgesteld;
  * ensureStop ziet geen open stop en plaatst een nieuwe, maar die krijgt 403 omdat de pending_cancel order de stukken nog vasthoudt;
  * stopMissing wordt gezet;
  * de cancel gaat daarna alsnog door.
  * Resultaat P1: 20 QLD bij de broker, geen enkele stop, geen sell, tot de volgende run (decide na de close, M6 de volgende dag).
* Zelfde patroon in setStop: de partially_filled tak (alpaca-paper-broker.ts:212 tot 220) en het opruimen van extra stops (204 tot 208) bij een timeout.
* Wat waar moet zijn: een run die een stop cancel niet bevestigd ziet, eindigt nooit met een positie die geen werkende stop heeft en niet verkocht is. Ook niet als de cancel later alsnog doorgaat.

### B2. Dubbele buy en positie zonder stop als het pollen van een gevulde buy één keer faalt
* Waar: src/momentum2/alpaca-paper-broker.ts:123 tot 131 en 185 (een GET fout in pollFill gooit door, terwijl de order al geplaatst is) en src/momentum2/live.ts:418 tot 432 (buy fout: intent terug in pending, boek leeg).
* Repro: dave-pr47-int.test.ts "P3" en "P3b".
* Wat er mis is: de market buy is geplaatst en gevuld, maar GET /v2/orders/{id} geeft één keer 503. Dan:
  * marketOrder gooit en de buy gaat terug in pending;
  * het boek kent de 20 QLD niet;
  * reconcile kijkt alleen naar het boek, dus er komt geen stop op.
  * De volgende handelsdag heeft de buy een nieuwe client_order_id (datum zit erin). Decide plant hem ook opnieuw, want het boek is leeg.
  * Resultaat P3b: broker 40 QLD, boek 20, stop 20. Dus een dubbele buy plus 20 QLD zonder stop en zonder eigenaar. M1 telt die 20 dan als eigen stukken (broker min boeken).
* Wat waar moet zijn:
  * Een order die mogelijk is geplaatst, wordt nooit opnieuw geplaatst voordat zijn echte status bekend is.
  * Een fill die de broker heeft gedaan, komt altijd in het boek en krijgt een stop, ook als de bevestiging tijdelijk faalt.
  * Voor de sell kant geeft dezelfde fout geen dubbele sell (sleeveQty begrenst), wel een spookpositie in het boek (follow up 3).

## 5. M1 blast radius
* exit-crypto qty_reserved: settings blijven staan als M1 stukken bezit die door een order van een andere sleeve worden vastgehouden. Gedrag klopt, C1 is groen. M1 probeert het daarna opnieuw.
* m1-etf-slots: één DB query; M1 telt alleen zijn eigen deel, exposure pro rata op market_value.
* totalExposure (cron-routines.ts:224): telt nu alleen M1's deel. Dat is bedoeld, maar het betekent dat M1's exposure cap de ETF posities van M5 niet meer meetelt. Geen blocker, wel bewust bevestigen.
* market-open: alleen via de tests gecontroleerd. Niet met de hand gedraaid.

## 6. Cosmo's fake-alpaca.ts
* Klopt:
  * replace vraagt geen vrije qty voor de eigen order (reservering van de oude order uitgezonderd);
  * de oude order gaat naar 'replaced';
  * client_order_id uniek ook bij PATCH;
  * reservering op rest (qty min filled).
* Mist (en daardoor zag pr47-blockers.test.ts B1 en B2 niet):
  * pending_cancel (cancel is daar altijd direct);
  * 'accepted' status (PATCH is dan niet toegestaan);
  * tijdelijke GET fouten na plaatsen;
  * de crypto fee (positie kleiner dan filled_qty);
  * de PATCH beperking "only patch full shares".

## 7. Follow ups (niet blokkerend)
1. Crypto fee (I3): het M6 boek en de stop staan op filled_qty 0,06, de echte positie is 0,05985. De M6 stop dekt zo 0,00015 BTC van M1, en M1 betaalt feitelijk M6's fee. Het boek moet de ontvangen qty volgen.
2. Docs: PATCH qty "only full shares", en niet in accepted/pending_*. Voor M6 (fractioneel) faalt een trailing raise met qty waarschijnlijk altijd. De oude stop blijft staan (P4 groen), maar de stop trailt dan nooit. Live checken, eventueel replace zonder qty als de qty gelijk is.
3. Een sell met onbekende status na een GET fout laat het boek met een positie die de broker niet meer heeft. Er volgt geen dubbele sell, wel een vervuilde foreignQty voor M1.
4. stopFills leest de laatste 500 orders account breed. Bij veel M1 orders valt een oude stop fill buiten het venster.
5. pending_replace telt als open: tijdens een replace kunnen oud en nieuw allebei als eigen stop gezien worden, en dan cancelt setStop er één als extra.
6. marketOrder 422 betekent niet altijd duplicate: hij volgt dan de order met die client_order_id. Dat is OK, maar log de oorspronkelijke 422 body.
7. Exit met partial fill en done=false: de exit intent valt weg en de rest krijgt pas een stop na het afsluiten van de order. Dat is bedoeld, maar bevestig het voor day orders die expiren.

## 8. Live verificatie (paper, na merge, door Dusty of met zijn ja)
* PATCH van een GTC stop (QLD) en een crypto stop_limit (BTC fractioneel): wordt het geaccepteerd, en wat gebeurt er met qty?
* Hoe lang staat een stop cancel in pending_cancel tijdens de sessie?
* Status van een stop die na de close is geplaatst ('accepted' of 'new').
* Crypto fee: position qty tegenover filled_qty.

Geen merge, push, flags, redeploy of Alpaca calls gedaan. .geheim overgeslagen. Worktree wt3 is schoon (__dave verwijderd).
