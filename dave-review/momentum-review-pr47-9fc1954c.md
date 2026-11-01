# Review PR 47 (Momentum M5/M6 papier, Cosmo B1/B2 fix) op head 9fc1954c

Reviewer: Dave · Techniek · 2026-11-01 17:30 CET (Amsterdam). Head gecontroleerd om 17:20 CET: nog steeds 9fc1954c1bcf6e62a2da950a3c3b5d9b98a2b234.
Repro's en logs: /workspace/dave/momentum-1101-1709/ (ook op branch dave/pr47-repros onder dave-review/momentum-1101/)

## Verdict: NOT GREEN

B1 en B2 uit de 5a93422-review zijn opgelost (v3 44/44 groen). Twee nieuwe blockers: B3 (een tweede variant van B2: dubbele buy na een POST-time-out) en B4 (integratie met de nieuwe main: de tick maakt papierorders, maar log en tab Vandaag zeggen "schaduw" of "geblokkeerd").

## CI op de exacte head 9fc1954c
- `guard unit tests` success (124901690992)
- `typecheck, lint & build (web)` success (124901805499)
- Niets pending. CI is groen, maar door B3 en B4 is het verdict toch NOT GREEN.
Lokaal: root `npm test` zonder web/node_modules 406/406 groen (logs-m47/root-test-serial.log). Cosmo meldde 405; lokaal zijn het er 406, en de tellingen tellen alleen zo. tsc 0, lint 0, build 0.

## Repro's
- v3 set (dave-review/pr47/v3, 27c1d09) op 9fc1954c: 44/44 PASS (v3-on-9fc1954c-raw.log). P1 (pending_cancel bij exit, B1) en P3/P3b (GET faalt tijdens pollen, B2) groen.
- v2 set: 7 rood, allemaal oude contracten (mock zonder replaceOrder, R2/N1b/N3/F2 oude verwachting). De aangepaste versies zitten in v3 en zijn groen. Dit is geen regressie.
- v4 (nieuw, repros/dave-pr47-v4.test.ts, log v4-on-9fc1954c-raw.log), zelfde nep-Alpaca als v3:
  - P5: ROOD (B3).
  - P6 (stop-cancel blijft langer dan het wachtvenster in pending_cancel): groen in het poll-model. De exit wordt uitgesteld, er komt een nieuwe stop van 20 en na settle staat er pos 20 met stop 20. Rest: de run wacht meerdere vensters van 120 × 500 ms (minuten) binnen één tick-request. Zie volgpunt 1.

## Vorige blockers
- B1 (pending_cancel): opgelost (P1 groen, P6 groen).
- B2 (GET faalt na gevulde buy): opgelost (P3/P3b groen).
- Follow-ups 1 tot 7 van 5a93422: 1 (crypto fee) is opgelost via `received`. 4 (500 orders) is opgelost via ordersFor met symbols en after. 5 (pending_replace) is opgelost: reconcile slaat het over. 2, 3, 6 en 7 staan nog open (niet blokkerend).

## Blockers

### B3. Dubbele buy (en 20 stuks zonder boek en zonder stop) als de buy-POST time-out geeft en de order nog niet zichtbaar is
- Plek: src/momentum2/alpaca-paper-broker.ts:256-270. Bij een tijdelijke fout (netwerk, time-out, 5xx) zoekt marketOrder één keer op client_order_id. Geeft dat `null` (Alpaca toont een net geplaatste order niet altijd meteen), dan `throw e` op regel 269 ("niets geplaatst"). Die aanname is fout: een time-out zegt niet dat er niets geplaatst is.
- Gevolg: src/momentum2/live.ts:468-476 vangt de fout, `fill` blijft null en de intent gaat terug in pending (`remaining.push(o)`). De volgende run maakt een nieuwe client_order_id met de nieuwe datum (live.ts:466, `momentumClientOrderId(cfg, date, …)`), dus de idempotentie werkt niet over dagen heen. Resultaat: een tweede buy.
- Repro P5 (dave-pr47-v4.test.ts): placeOrder zet de order wel bij Alpaca en vult hem, maar gooit `socket hang up (ETIMEDOUT)`. De eerste getOrderByClientOrderId geeft null. Run dag 1, daarna executeDay 2024-06-04.
  Uitkomst: `pos 40, boek 20, stop 20, buys [m5-…-2024-06-03-QLD-b, m5-…-2024-06-04-QLD-b]`. Verwacht pos 20. Dus 20 stuks staan niet in het boek, hebben geen stop en tellen als foreignQty voor M1. Hetzelfde pad bestaat voor sells (live.ts:429). Een sell die dubbel gaat, kan op een margin-papieraccount short gaan.
- Regel: "Any order POST timeout needs idempotency (deterministic client_order_id plus lookup on timeout/5xx)". De lookup is er, maar een lege lookup na een time-out mag niet "niets geplaatst" betekenen.
- Fix-richting: bij een tijdelijke fout en een lege lookup de `cid:`-marker teruggeven (`{orderId: 'cid:'+clientOrderId, qty 0, done false}`), net als in de catch op regel 265. De volgende run volgt de order dan op client_order_id. Is hij er dan nog steeds niet, dan wordt de intent pas opnieuw ingepland. Of maak de client_order_id stabiel per intent (signalDate in plaats van de uitvoerdatum), zodat Alpaca een dubbele weigert (422 en dan volgen). Liefst beide. P5 moet groen.

### B4. Na merge op de nieuwe main maakt de tick papierorders, maar log en Vandaag-tab melden iets anders
- Main heeft nu PR 48 (tick roept runMomentum5/6 aan) en PR 50 (tab Vandaag). PR 47 merget schoon (merge-tree dff84d9). Maar:
  - Op de lokale merge-preview b3b2c64 (niet gepusht) gaat de tick bij MOMENTUM5/6_ENABLED=1 + DRY_RUN=0 de papierbroker in (repro dave-pr48-tick-e2e S2: alpaca.openOrders aangeroepen). Dat is de bedoeling van PR 47, maar:
  - web/lib/momentum-tick.ts:77 logt hardcoded `schaduw`, en momentum-tick.ts:12 zegt "geen pad naar echte orders". Een papierrun logt dan "ok schaduw".
  - src/home/build-home.ts:64 gebruikt resolveShadowMode. M5/M6 met DRY_RUN=0 tonen dan "GEBLOKKEERD", met de reden "echte orders zijn in deze versie geblokkeerd", terwijl er papierorders lopen.
  - De cancel-wachttijd (120 × 500 ms per symbool, P6: meerdere vensters) draait binnen de tick-HTTP-request van scheduler-tick (curl), naast M1.
- Fix: rebase op main. Tick-log uit de echte mode (`schaduw` of `papier`). build-home met resolveMomentumPaperMode en de status "papier". Een test die laat zien dat de tick bij DRY_RUN=0 een papierrun logt als papier. Een time-out of budget per tick voor de cancel-wachttijd. Daarna CI op de nieuwe head.

## DELETE/UPDATE-grenzen
Ronde 2 voegt geen SQL DELETE of UPDATE toe. Alpaca DELETE (cancelOrder) gaat alleen per order-id, voor eigen orders (client_order_id-prefix plus openOrders uit het eigen boek), net als in de 5a93422-review. PATCH (replaceOrder) idem. Store-DELETE is upsertDropLegacy, gebonden op de key.

## Volgpunten (niet blokkerend)
1. Een cancel die langer dan het venster hangt (Cosmo's restpunt): de exit wordt uitgesteld en de stop blijft staan (P6 groen). Begrens de totale wachttijd per run, zeker binnen de tick.
2. Openstaand uit 5a93422: 2 (PATCH qty voor fractioneel), 3 (sell met onbekende status), 6 (422 body loggen) en 7 (partial plus done=false bij day orders).
3. Het M6-fee-pad en het ordersFor-venster zijn opgelost. Live verifiëren op papier na merge (met Dusty's ja).
