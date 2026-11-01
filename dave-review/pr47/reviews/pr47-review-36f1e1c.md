# Review trader-dashboard PR 47, head 36f1e1c (base main 1286950)

Oordeel: NIET GROEN. Niet mergen, geen DRY_RUN=0 zetten.

Niets gemerged, gepusht, geredeployed of aan flags gezet. Geen calls naar Alpaca (alles gemockt). .geheim overgeslagen. Railway alleen varnamen gelezen: geen MOMENTUM5/6 of DRY_RUN vars, dus het papierpad staat nu uit.

## 1. CI en lokaal
* CI run 41317151172 op 36f1e1c
  * guard unit tests, check 124879502857: groen (15:37:57 tot 15:38:25 CET)
  * typecheck, lint & build (web), check 124879624699: ROOD (15:38:27 tot 15:39:38 CET)
* Lokaal root npm test zonder web/node_modules: 106 suites, 364 tests groen, maar "Force exiting Jest" (forceExit maskeert de open handle, lost hem niet op)
* web tsc: exit 2
  * lib/momentum2/broker.ts:67 TS2353 listOpenStops bestaat niet in type Broker
  * lib/momentum2/paper-run.ts:9 TS2322 Broker niet toewijsbaar aan BrokerWithStops
* web lint schoon, web build exit 1 (zelfde typefout). App is zo niet te bouwen of te deployen.

## 2. Modusmatrix en bereikbaarheid
resolveMomentumPaperMode (src/momentum2/mode.ts) geeft papier alleen bij ENABLED exact '1' en DRY_RUN exact '0'.

| ENABLED \ DRY_RUN | ontbreekt | '' | '0' | ' 0' / '0 ' | 'false' | '1' |
|---|---|---|---|---|---|---|
| ontbreekt, '', '0', ' 1', 'true' | uit | uit | uit | uit | uit | uit |
| '1' | schaduw | schaduw | PAPIER | schaduw | schaduw | schaduw |

Repro MX1 checkt 144 combinaties voor M5 en M6: groen. Globale DRY_RUN of de flag van de andere sleeve opent niets (MX2 groen). M2/M3 weigeren DRY_RUN=0 nog (MX3 groen).

Paden naar alpacaPaperBroker: alleen brokerForMode, alleen aangeroepen vanuit web/lib/momentum5/run.ts:35 en web/lib/momentum6/run.ts:38, alleen via POST /api/momentum5/run en /api/momentum6/run met requireCronAuth. Geen cron, scheduler of railway.json entry. In schaduw doet brokerForMode nul Alpaca calls (MX5 groen).

Paper host: placeOrder en trading DELETE gaan via assertAlpacaPaperTrading (src/alpaca/paper-host.ts:41). Live host, lookalike host en rommel worden geweigerd (MX4 groen). Let op: openOrders/orders zijn GETs, dus lezen kan ook van een live host; schrijven niet.

## 3. Repro resultaten (web/lib/momentum2/__dave, 26 tests: 16 groen, 10 rood)
Rood = bevinding (test eist het gewenste gedrag).

| Test | Uitkomst | Betekenis |
|---|---|---|
| MX1 t/m MX5 modus, host, schaduw | groen | gating klopt |
| K1 crypto TIF | ROOD | marketOrder stuurt 'day' voor BTC/USD |
| K2 qty wijziging zelfde prijs | ROOD | hergebruikt client_order_id van de net gecancelde stop |
| K3 plaatsen faalt na cancel | ROOD | 0 stops over |
| K4 prefix isolatie | groen | m5s-/m6s-, versies en M1 orders gescheiden |
| K5 crypto stop | groen | stop_limit gtc, limit 0,995 x stop |
| L1 setStop gooit na buy fill | ROOD | broker 20 QLD, boek 0, geen stop |
| L2 crypto fee | ROOD | stop 0,1 BTC op positie 0,09975, Alpaca weigert, run gooit |
| L3 stop al gevuld | groen | geen nieuwe stop, geen sell |
| L4 volgorde exit | groen | eerst cancel, dan sell |
| L5 race stopfill tussen check en cancel | ROOD | positie wordt 20 short |
| L6 gedeeltelijk gevulde stop | ROOD | 8 short (stopFill ziet alleen 'filled') |
| L7 twee runs plus reconcile | groen | precies 1 stop, qty 20 |
| R1 reconcile dedupe twee stops | ROOD | 0 stops over |
| R2 reconcile slaat schaduwboek over | groen | |
| F1 schaduwboek naar papier | ROOD | fantoom QLD 100 wordt real, M1 ziet 100 foreign |
| C1 M1 crypto exit naast M6 BTC | ROOD | cancelt m6s stop en verkoopt 0,1 i.p.v. 0,04 |
| D1, B1, T1, A1, O1 | groen | dedupe, slotbar, bad tick, bearer, M1 eigendom |

## 4. Blockers
1. CI en build rood: web/lib/momentum2/broker.ts:67 en web/lib/momentum2/paper-run.ts:9. App bouwt niet.
2. Crypto marketorder met time_in_force 'day': web/lib/momentum2/broker.ts:21. Alpaca staat voor crypto alleen gtc en ioc toe (docs). M6 buy faalt. M6 exit is erger: live.ts:178 cancelt eerst de stop, daarna faalt de sell, run gooit, BTC staat zonder stop tot de volgende run. (K1)
3. Fill weg uit het boek als setStop gooit: src/momentum2/live.ts:207 savePending([]) staat voor setStop (live.ts:214) en saveBook (live.ts:222). Positie bij broker zonder boek en zonder stop, volgende signaal koopt opnieuw (dubbele buy). (L1)
4. Crypto stop qty = gevraagde/gevulde qty, maar Alpaca trekt de fee af van de ontvangen BTC: stop wordt geweigerd en via blocker 3 verdwijnt de fill uit het boek. src/momentum2/live.ts:214 met fill qty uit broker.ts:25. (L2)
5. setStop cancelt eerst alles en plaatst daarna: web/lib/momentum2/broker.ts:40 tot 63. Elke plaatsfout laat de positie zonder stop. Id is alleen prijs (broker.ts:41), dus qty wijziging bij gelijke prijs hergebruikt een id (weigering bij Alpaca niet live geverifieerd). (K2, K3)
6. Reconcile dedupe cancelt alle stops: src/momentum2/reconcile-disaster-stops.ts:52 tot 59. cancelStop werkt op prefix+symbool, dus ook de stop die je wilde houden gaat weg, en matches[0] wordt daarna als levend behandeld. (R1)
7. Schaduwboek wordt papierboek met fantoomposities: web/lib/momentum2/paper-run.ts:19 tot 23. Reconcile en exits gaan dan sells en stops plaatsen voor stukken die de rekening niet heeft (short), M1 rekent ze als foreign. (F1)
8. M1 crypto exit raakt M6: web/lib/crypto/exit-crypto-position.ts:71 tot 74 cancelt elke sell order op het symbool (geen isForeignStrategyOrder filter) en :132 verkoopt de hele positie. Dubbele sell en M6 zonder stop. (C1)
9. Dubbele sell bij race en bij gedeeltelijke stopfill: broker.ts:91 telt alleen status 'filled'; tussen stopFill (live.ts:160) en cancelStop (live.ts:178) kan de stop vullen, daarna verkoopt marketOrder de volle qty. Short op papier. Smal venster, maar bij een gap open reëel. (L5, L6)

## 5. Wat goed is
* Modusgating exact, M2/M3 ongewijzigd schaduw, geen cron.
* Prefixen overlappen niet (m5s-m5-nasdaq-trend- vs m5s-m5-nasdaq-tqqq-, afsluitende '-').
* M1 EOD flatten (cancelSellLegsAndWait) slaat m5s-/m6s- over; m1CloseQty trekt real boeken af (O1).
* Exit: cancel voor sell (L4); gevulde stop geeft geen nieuwe stop of sell (L3).
* Dedupe nieuwste wint, slotbar check, bad tick 15% kloppen (D1, B1, T1).
* Bearer: lege of foute bearer en geen secret in productie geven false (A1).

## 6. Follow ups (geen blocker)
* verifyCronBearer (src/security/production-auth.ts:28) vergelijkt met ===, niet timing safe (bestond al). Zonder secret open buiten productie.
* middleware.ts:31 prefix '/api/momentum' is breed; beter exacte routes.
* forceExit in jest config maskeert open handle.
* marketOrder geeft null na 15 s ook als de order later vult; dan boek achter op broker.
* M1 EOD logt CLOSE voor alle ETF posities en market-open telt QLD/BIL mee in maxPositions en exposure.
* Noodstop flattenAllPositions werkt boeken niet bij.
* stop_limit met limit 0,995 kan bij een gap onvervuld blijven: positie dan feitelijk onbeschermd. Overweeg een vangnet (bv. bij volgende run market sell als prijs onder limit).

## 7. Live te verifiëren
Schaduwdag (DRY_RUN niet 0):
* ALPACA_BASE_URL host is paper-api.alpaca.markets en NODE_ENV=production in Railway (waarden niet gelezen).
* Run geeft 0 Alpaca writes, boeken real=false, logs tonen slotbar check en dedupe.
* IEX feed bars voor QLD/TQQQ/BIL en BTC/USD compleet op de beslisdag.
Papierdag (pas na fixes en Dusty's ja):
* Voor de flip: schaduwboek resetten of leeg verifiëren (blocker 7).
* Crypto order met gtc of ioc wordt geaccepteerd; positie qty na fee vs stop qty.
* Alpaca gedrag bij hergebruik client_order_id na cancel.
* Cancel geeft pending_cancel: setStop/cancelStop moeten wachten tot canceled.
* Precies 1 m5s-/m6s- stop per positie na elke run; M1 crypto scan laat m6s- staan.
* stop_limit gedrag bij een snelle BTC daling.

Repros: /workspace/dave/pr47/dave-pr47-*.test.ts, log in /workspace/dave/pr47/repro-run.log. Draaien: kopieer naar wt/web/lib/momentum2/__dave en npm test -- web/lib/momentum2/__dave.
