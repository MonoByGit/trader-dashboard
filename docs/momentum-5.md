# Momentum 5 — nasdaq-trend (papier, schaduw)

QLD wanneer QQQ boven 200d SMA × 1,02; BIL wanneer QQQ onder × 0,98; in de band huidige positie houden. Signaal op de close, uitvoering bij de volgende open.

- Budget 10% paperkapitaal, verliesgrens 20% van de sleeve.
- 15% trailing stop op QLD; na hit naar BIL tot een nieuw up-signaal.
- Optioneel: `MOMENTUM5_TQQQ=1` activeert een TQQQ-variant (3% budget) naast de hoofdversie.

Aan: `MOMENTUM5_ENABLED=1`. Schaduw alleen; `MOMENTUM5_DRY_RUN=0` wordt geweigerd (zelfde regel als M2/M3).

Boeken: `settings` key `m:book:m5-nasdaq-trend` (legacy `m2:book:*` wordt nog gelezen). Orders: prefix `m5-`.

Backtest: `npx tsx scripts/run-momentum5.ts` (Alpaca keys voor marktdata).
