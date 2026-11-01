# Momentum 5 — nasdaq-trend (papier, schaduw)

QLD wanneer QQQ boven 200d SMA × 1,02; BIL wanneer QQQ onder × 0,98; in de band huidige positie houden. Signaal op de close, uitvoering bij de volgende open.

- Budget 10% paperkapitaal, verliesgrens 20% van de sleeve.
- **Close-disaster** default 30% onder hoogste close sinds instap: in schaduw/plan nog steeds uitstap volgende open; bij papier (`MOMENTUM5_DRY_RUN=0`) ook broker GTC stop op QLD/TQQQ (`m5s-<versie>-` prefix). Hoofduitstap blijft het QQQ-bandregime. Na disaster naar BIL tot fresh-up (dip onder bovenband, dan opnieuw erboven).
- Bad-tick filter in sim: zie `docs/momentum-6.md` (zelfde 15%-regel).
- BIL heeft bewust geen stop (cash-sleeve, geen risicopositie).
- `floatingBudget: true` (compounding binnen de sleeve; verliesgrens t.o.v. startbudget).
- Optioneel: `MOMENTUM5_TQQQ=1` activeert een **experimentele** TQQQ-variant (3% budget, hogere verliesgrens dan de close-disaster).

Aan: `MOMENTUM5_ENABLED=1`. Schaduw alleen; `MOMENTUM5_DRY_RUN=0` wordt geweigerd (zelfde regel als M2/M3).

Boeken: `settings` key `m:book:m5-nasdaq-trend` (legacy `m2:book:*` wordt nog gelezen). Orders: prefix `m5-`.

Backtest: `npx tsx scripts/run-momentum5.ts` (Alpaca keys voor marktdata).
