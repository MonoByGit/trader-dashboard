# Afmaak Briefing — Add-on na onderzoek

**Voor:** lopende Claude Code sessie in `/Users/idusty/Documents/Cosmo OS/Trading/`
**Status:** Aanvulling op `AFMAAK_BRIEFING.md` van eerder vandaag
**Door:** Cosmo (Cowork sessie, 31 mei 2026)

---

## Waarom deze add-on

Dusty en ik hebben een grondige research-ronde gedaan over wat in 2026 echt werkt voor adaptieve trading-systemen, en wat de meeste retail-bots fout doen. Conclusie: de huidige Momentum-1 doet discipline goed, maar mist regime-awareness, ensemble-aanpak en adaptieve sizing. Dat zijn precies de dingen die het verschil maken tussen de 20-30% retail bots die winst maken en de 70-80% die verliest.

Behandel deze add-on als uitbreiding op fases 1 t/m 5 die al in `AFMAAK_BRIEFING.md` staan. Eerst die fases afronden, dan deze twee fases erbij. Niet door elkaar.

---

## Onderzoeksbevindingen (cijfers waarop dit plan is gebouwd)

- 70-80% retail bot gebruikers verliest geld (2025-2026 data)
- 44% van gepubliceerde strategieën repliceert niet op nieuwe data
- Goede bots halen 15-25% jaarlijks bruto met 10-15% max drawdown, Sharpe 1.5+
- Win rate winnaars: 55-65% (niet hoger, focus op risico-asymmetrie)
- Volatility targeting alleen verlaagt drawdowns met 25-40%
- Winnaars draaien multi-strategy met regime detection, niet single-strategy

Wat winnaars structureel anders doen: focus op proces niet voorspelling, multi-strategy ensemble, adaptieve position sizing (fractional Kelly + vol targeting), walk-forward validatie, harde circuit breakers, en LLM als co-piloot voor sentiment/hypothesis (niet voor prijsvoorspelling).

---

## Fase 6 — Strategy Intelligence Upgrade

**Doel:** Bot wordt regime-aware en draait meerdere complementaire strategieën met adaptieve sizing.

### 6.1 Regime detection laag

Bouw een classifier die elke 30 minuten tijdens markturen draait en output geeft: `'trending_up' | 'trending_down' | 'range_bound' | 'high_vol'`.

Eerste versie (eenvoudig, snel werkend):
- VIX-niveau: <18 calm, 18-25 normal, >25 high_vol
- ADX op SPY (14-period): >25 trending, <20 range_bound
- Breadth indicator: percentage NYSE stocks boven 50-day MA (>60% = bull breadth, <40% = bear breadth)

Combineer in een simpele decision tree. Output naar nieuwe tabel `regimes` met `(timestamp, regime, vix, adx, breadth, confidence)`.

Latere upgrade pad: Hidden Markov Model met covariance-aware variants. Maar start simpel.

### 6.2 Tweede strategie naast momentum

Implementeer `MeanReversion` strategie die alleen actief is in `range_bound` regime:

Entry: RSI(14) onder 30 EN prijs onder onderkant Bollinger Band (20-period, 2 std) op symbol uit de universe.
Exit: prijs raakt middle band (terug naar mean), of stop bij doorbreek lower band met 1%.

Strategieën leven in `src/strategies/` met gemeenschappelijke interface:

```typescript
interface Strategy {
  name: string;
  activeRegimes: Regime[];
  evaluate(symbol: string, bars: Bar[], context: MarketContext): Signal;
}
```

Een nieuwe `runStrategyDispatcher()` checkt eerst huidige regime, dispatched naar actieve strategieën, aggregeert signalen.

### 6.3 Volatility-targeting position sizing

Vervang vaste 25% door dynamische berekening:

```
target_portfolio_vol = 0.12 (12% jaarlijks)
symbol_vol = 20-day realized volatility van symbol
position_weight = target_portfolio_vol / symbol_vol
position_size_usd = portfolio_equity * position_weight
```

Plus fractional Kelly cap als bovengrens (1/4 Kelly op basis van rolling win rate en avg win/loss ratio van de strategie).

Implementeer in `src/sizing/vol_target.ts`. Voor elke order log: berekende vol, Kelly cap, uiteindelijke size en welke van de twee bond was.

### 6.4 Wekelijkse hypothesis loop

Elke vrijdag na EOD (16:30 ET, na de bestaande weekly review):

Claude Opus krijgt input: alle decisions, trades, P&L van afgelopen 4 weken plus huidige regime-distributie.

Output: drie tot vijf hypothesen over wat werkt en wat niet, plus voorgestelde aanpassingen aan parameters of nieuwe filter-regels.

**Belangrijk**: hypotheses worden NIET direct lessons. Ze gaan in een schaduw-tabel `hypothesis_tests` en draaien zes weken paper-only mee. Na zes weken: als positief resultaat (P&L impact significant beter dan baseline), dan pas naar lesson_proposals voor Dusty's approval.

Tabel schema:
```sql
CREATE TABLE hypothesis_tests (
  id TEXT PRIMARY KEY,
  hypothesis TEXT,
  proposed_change JSONB,
  proposed_at TIMESTAMP,
  test_period_end TIMESTAMP,
  status TEXT, -- 'testing' | 'validated' | 'rejected'
  baseline_pnl NUMERIC,
  test_pnl NUMERIC,
  result_notes TEXT
);
```

### 6.5 News en sentiment laag

Gemini Flash draait elke ochtend om 08:00 ET over Reuters/MT Newswires headlines per symbol in de universe.

Output JSON per symbol:
```json
{
  "QQQ": { "sentiment": 0.6, "event_risk": "low", "summary": "Tech sector stabiel" },
  "XLE": { "sentiment": -0.3, "event_risk": "high", "summary": "OPEC+ meeting vandaag" }
}
```

Opslaan in `sentiment_signals` tabel met timestamp.

`runMarketOpen()` checkt: als `event_risk == 'high'`, sla die symbol over (extra NO_GO gate). Dusty ziet dit terug in decision log met expliciete vermelding "event_risk filter".

---

## Fase 7 — Cross-asset diversificatie via Crypto

**Doel:** Meer beslismomenten, lagere correlatie, 24/7 markt.

Crypto correleert vaak negatief of laag met aandelen. Alpaca ondersteunt BTC/USD en ETH/USD paper trading. Dezelfde strategieën werken, alleen met aangepaste parameters omdat crypto-vol veel hoger is.

1. Voeg `crypto_universe = ['BTC/USD', 'ETH/USD']` toe als aparte universe naast `equity_universe`
2. Maak een aparte `runCryptoCheck()` routine die elke 4 uur draait (cron: `0 */4 * * *`), ook in weekend
3. Hergebruik momentum + mean reversion strategies met aangepaste params:
   - Crypto hard stop: 3% in plaats van 2% (hogere baseline vol)
   - Crypto RSI band: 40-80 in plaats van 50-75
   - Crypto trailing: 5% in plaats van 3%
4. Position sizing: maximaal 20% van portfolio in crypto, separate allocation pool van equity
5. Aparte UI sectie in dashboard: crypto P&L, crypto posities, crypto regime (kan anders zijn dan equity regime)

---

## Realistische verwachting

Geen jackpot. Geen 100% per jaar beloftes. Wat we redelijkerwijs kunnen mikken als deze upgrades werken zoals bedoeld:

- Jaarlijks bruto: 15-25%
- Maximum drawdown: 10-15%
- Sharpe ratio: 1.5 of hoger
- Win rate: 55-65%

Vereist minimaal zes maanden paper trading bewijs voordat er ook één euro live gaat. Dat is non-negotiable. Bot moet bewijzen dat hij over meerdere regimes presteert, niet alleen toevallig in een bullmarkt zat.

---

## Wat NIET in deze add-on zit

Ik heb bewust een aantal "nice to have" features niet opgenomen omdat ze de scope te ver oprekken en niet bewezen rendement hebben voor retail:

- Deep RL agent die de hele strategie zelf bedenkt (te data-hungry, te instabiel, te slecht uitlegbaar)
- Options strategies (te complex, te grote risk asymmetry zonder ervaring)
- High-frequency intraday (vereist infrastructuur die retail niet betaalbaar krijgt)
- Sentiment scraping van social media (signal-to-noise ratio is dramatisch, vooral X/Reddit)

Deze kunnen later, na zes maanden bewezen base. Niet nu.

---

## Volgorde van aanpakken (advies aan Claude Code)

Werk niet in deze fase-volgorde, maar in deze waarde-volgorde:

1. Eerst fase 1 (bot tot leven) + fase 5 (Telegram + Open Brain). Dan ben je live en weet Dusty meteen wat er gebeurt.
2. Daarna fase 6.3 (vol targeting). Dit is de single grootste risk-reduction met de minste code.
3. Daarna fase 6.1 + 6.2 (regime detection + mean reversion). Dit is multi-week werk.
4. Daarna fase 2 (Lessons AI-loop) want die heeft regime-aware decision history nodig om iets zinnigs te leren.
5. Fase 4 (Mono brand UI) parallel aan 3 en 4.
6. Fase 7 (crypto) als alles op equities werkt.

Rapporteer per fase: wat ging goed, wat is unclear, welke ontwerpkeuzes heb ik gemaakt en waarom. Dusty wil meelezen, niet alleen accepteren.

---

Succes. En vergeet niet: Dusty leert mee, dus uitleg in begrijpelijke taal naast elke technische keuze.
