# Review trader-dashboard PR 47, head a6fcc52 (base main 1286950)

Oordeel: NIET GROEN. Niet mergen, geen DRY_RUN=0.

De 9 oude blockers zijn op gedrag grotendeels opgelost en CI/build zijn groen. Maar de nieuwe broker qty logica gebruikt Alpaca's qty_available. Bij Alpaca reserveren open sell orders de stukken (held_for_orders; Alpaca docs "How to Fix 30 Common Errors", nr 26, plus forum). Elke M5/M6 positie heeft een open GTC stop, dus voor het eigen symbool is qty_available 0. Daardoor gaan exits en stopverhogingen in papier nooit door.

Niets gemerged, gepusht, geredeployed of aan flags gezet. Geen Alpaca calls (alles gemockt). .geheim overgeslagen.

## 1. CI en lokaal (zelf gecontroleerd)
* CI run 41318189952, head_sha a6fcc529a1e55a68cf8c5096856d2ccb409542c1
  * guard unit tests, check 124882605982: success (15:50:42 tot 15:51:04 CET)
  * typecheck, lint & build (web), check 124882707257: success (15:51:06 tot 15:52:31 CET)
* Lokaal root npm test (zonder web/node_modules, met --detectOpenHandles): 110 suites, 373 tests groen. Geen "Force exiting Jest", geen open handle melding. forceExit is weg uit package.json.
* web tsc exit 0, lint schoon, build "Compiled successfully".

## 2. Repros voor en na (34 tests in /workspace/dave/pr47/v2, plus A2)
Aangepast aan de nieuwe signaturen (MomentumBroker, positionQty, orderId, getOrder), eisen niet verzwakt. De nep-rekening volgt nu de Alpaca regels: posities account breed, open sells reserveren, partially_filled zichtbaar, dubbele client_order_id geweigerd.

| ID | 36f1e1c | a6fcc52 | Opmerking |
|---|---|---|---|
| MX1 t/m MX5 (modus, 144 combi, host, schaduw) | groen | groen | |
| K1 crypto TIF | rood | groen | gtc |
| K2 nieuwe unieke id bij qty wijziging | rood | groen | id met qty en seq |
| K3 plaatsfout laat stop staan | rood | groen | plaats eerst |
| K4 prefix isolatie | groen | groen | |
| K5 crypto stop_limit | groen | groen | |
| L1 fill blijft in boek | rood | deels | boek 20 klopt; filled buy staat wel weer in pending (N4) |
| L2 crypto fee | rood | groen | stop qty uit broker |
| L3 gevulde stop | groen | groen | |
| L4 cancel voor sell (zonder open stop) | groen | groen | |
| L5 race | rood | groen | maar alleen omdat de sell door N1 nooit loopt |
| L6 gedeeltelijke stopfill | rood | groen | idem, sell overgeslagen door N1 |
| L7 twee runs plus reconcile | groen | groen | |
| R1 reconcile dedupe | rood | groen | cancel op orderId |
| R2 reconcile slaat schaduw over | groen | groen | |
| F1 schaduw naar papier | rood | groen | leeg real boek |
| C1 M1 crypto exit naast M6 | rood | groen | m6s overgeslagen, verkoopt 0,04 |
| D1, B1, T1, A1, O1 | groen | groen | A1: juiste secret true, fout/leeg false |
| N1 exit met open eigen stop | nieuw | ROOD | 0 verkocht, pending weg |
| N1b stop verhogen via executeDay | nieuw | ROOD | stop blijft op oude prijs |
| N2 plaats dan cancel bij volle positie | nieuw | ROOD | Alpaca 403, oude stop blijft |
| N2b positionQty met open stop | nieuw | ROOD | geeft 0 i.p.v. 20 |
| N3 M1 0,04 BTC plus M6 koop 0,06 | nieuw | ROOD | M6 stop 0,1 (ook M1's BTC) |
| N5 stops tegelijk open (positie 30, stop 10 naar 20) | nieuw | ROOD | even 2 eigen stops |
| L8 blijvende partial fill, 2 runs | nieuw | ROOD | boek 12 wordt 4 |
| F2 terug naar schaduw met real boek | nieuw | ROOD | schaduwkoop QLD 20 in real boek |
| A2 niet-ASCII bearer | nieuw | ROOD | RangeError i.p.v. false |

Totaal v2: 34 tests, 25 groen, 9 rood, plus A2 rood.

## 3. Blockers
1. N1/N2b: exit sell gebeurt nooit. brokerQty (src/momentum2/live.ts:43) gebruikt positionQty = positionQtyAvailable (web/lib/momentum2/broker.ts:181 tot 186). Met de eigen open stop is dat 0, dus src/momentum2/live.ts:225 tot 227 doet `continue`. De sell wordt niet uitgevoerd en ook niet bewaard. M5 blijft in QLD/TQQQ bij risk off en M6 in BTC bij een exit signaal, tot de disaster stop (30% of 20%). Dat is echt verlies tegenover de strategie en de kernfunctie werkt niet.
2. N1b/N2: stops worden nooit verhoogd en reconcile faalt dagelijks.
   * placeDisasterStop (live.ts:77) stopt bij qty 0.
   * Reconcile (src/momentum2/reconcile-disaster-stops.ts) roept setStop aan, en setStop plaatst eerst (web/lib/momentum2/broker.ts:92) en cancelt daarna (broker.ts:117). Bij Alpaca wordt de nieuwe sell geweigerd met 403 insufficient qty, omdat de oude stop de stukken vasthoudt.
   * Reconcile vangt dat niet af, dus de run eindigt in een fout.
   * De trailing bescherming werkt niet.
3. N3: M6 stop dekt ook M1's BTC. positionQty is account breed. Houdt M1 al BTC, dan zet M6 de stop op 0,1 i.p.v. 0,06 (live.ts:77 en verder).
   * Gaat die stop af, dan wordt M1's BTC mee verkocht.
   * De M1 exit ziet daarna available 0, krijgt `no_qty` en wist zijn exit settings (web/lib/crypto/exit-crypto-position.ts:137 tot 141).
   * Ook live.ts:91 kan de boek qty overschrijven met andermans qty.
4. N4: een gevulde buy gaat terug in pending als de stop faalt (live.ts:295 tot 296, `remaining.push(o)`).
   * Een retry dezelfde dag wordt alleen tegengehouden door Alpaca's weigering van een dubbele client_order_id (niet live geverifieerd).
   * Slaat decide over (dagbar nog niet gesloten), dan koopt de execute van de volgende dag met een nieuwe id opnieuw. Dat is een dubbele buy.
5. L8: een blijvende partial fill wordt elke run opnieuw afgeboekt. stopFill zoekt sinds entryDate (live.ts:203 tot 206) en vindt elke dag dezelfde partially_filled order.
   * Het boek loopt leeg (12 wordt 4, daarna 0).
   * Reconcile cancelt dan de stop van een positie die er bij de broker nog is. Gevolg: positie zonder stop en zonder boek.
   * Realistisch voor de M6 stop_limit bij een gap.
6. F2: terugschakelen naar schaduw met een real boek.
   * runMomentum5/6 in schaduw gebruikt het real boek met shadowBroker, dus schaduwkopen komen als echte posities in het real boek (live.ts executeDay, geen real check).
   * Bij de volgende papierdag hergebruikt paper-run.ts:24 dat boek. Dan komen er stops en sells voor stukken die de rekening niet heeft (short), en M1 telt ze als foreign.
   * Terugschakelen is precies wat je bij een incident doet.

## 4. Blast radius
* M1 crypto exit (exit-crypto-position.ts)
  * Zonder foreign is het gedrag gelijk aan voorheen: m1Qty = positie, sellQty = available, close_position blijft.
  * Met M6: sellQty = min(available, positie min M6 boek). Klopt als het M6 boek exact klopt.
  * Ligt het M6 boek boven de echte M6 qty (fee, of live.ts:91 met andermans qty), dan verkoopt M1 te weinig en blijft er een rest zonder stop achter, terwijl de settings gewist worden.
  * Erger in combinatie met blocker 3.
* m1-etf-slots.ts
  * QLD/TQQQ/BIL tellen niet meer mee voor maxPositions. M1's eigen ETF's tellen gelijk als voorheen (foreign 0).
  * totalExposure (web/lib/cron-routines.ts) telt M5 ETF's nog wel mee.
  * Nieuwe DB call per positie: faalt de DB, dan faalt M1 market-open.
* Cron auth
  * middleware laat /api/cron en /api/scheduler/ ongewijzigd door, en daarnaast exact de 4 momentum run routes. Er bestaan geen andere momentum routes.
  * verifyCronBearer met de juiste secret geeft true en een foute of lege bearer false (A1 groen). M1 cron en /api/scheduler/tick blijven dus werken.
  * Kleine kanttekening A2: een niet-ASCII header met gelijke stringlengte geeft een RangeError (production-auth.ts:38). Dat wordt een 500 i.p.v. 401, geen bypass.
* Plaats dan cancel
  * Bij een volle positie weigert Alpaca de tweede sell (blocker 2).
  * Is de positie groter dan de stop (qty verhoging), dan staan er even 2 eigen stops open (N5). Vullen beide in dat venster, dan wordt er dubbel verkocht.
  * Daarna cancelt de code de oude op id. Als de oude net vult, geeft awaitStopOrderCanceled 'filled' terug, maar dat wordt genegeerd. De nieuwe stop blijft dan staan op een kleinere positie. Smal venster.
* setStopWithRetry
  * Maximaal 3 pogingen met 400 ms pauze, geen oneindige lus.
  * Na een mislukte sell wordt de stop opnieuw gezet met de qty van vóór de sell. Is de sell gedeeltelijk gevuld, dan is die qty te groot.
  * Gooit marketOrder (4xx) i.p.v. null te geven, dan wordt de stop niet teruggezet en draait reconcile niet in die run. De positie staat dan zonder stop tot de decide run.

## 5. Modusmatrix en bereikbaarheid
Ongewijzigd en groen.
* Papier alleen bij ENABLED exact '1' en DRY_RUN exact '0'. 144 combinaties voor M5 en M6 getest.
* M2/M3 weigeren DRY_RUN=0.
* De paper host wordt afgedwongen.
* brokerForMode wordt alleen aangeroepen vanuit de M5/M6 POST routes met cron auth.
* Geen cron of scheduler entry.
* In schaduw nul Alpaca calls.

## 6. Follow ups (geen blocker)
* A2: verifyCronBearer moet bytelengte vergelijken (of beide hashen).
* totalExposure in M1 market-open zonder M5/M6.
* stopFill since entryDate kan een oude stopfill van dezelfde dag aan een nieuwe positie koppelen.
* De outcome 'filled' van awaitStopOrderCanceled wordt nergens gebruikt.
* De stop_limit 0,995 gap is nog niet beschermd.

## 7. Live te verifiëren op de papierdag (pas na de fixes en na Dusty's ja)
* Na de buy en de stop: qty_available is 0 en een exit sell gaat door (direct test op blocker 1).
* Stop verhogen werkt zonder 403 en er staat precies 1 m5s/m6s stop.
* Hoe Alpaca reageert op een dubbele client_order_id.
* De crypto positie na fee is gelijk aan de stop qty.
* pending_cancel duurt even; daarna gaat de sell door.
* stop_limit gedrag bij een snelle BTC daling, en een partial fill.
* M1 crypto en M6 tegelijk in BTC: wie verkoopt wat.
* ALPACA_BASE_URL is paper-api, NODE_ENV=production.

Repros: /workspace/dave/pr47/v2/*.test.ts, log in /workspace/dave/pr47/v2/repro-run.log. Lokale logs: /workspace/dave/pr47/v2-*.log.
