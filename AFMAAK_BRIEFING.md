# Momentum-1 Afmaak Briefing

**Voor:** Claude Code sessie in `/Users/idusty/Documents/Cosmo OS/Trading/`
**Door:** Cosmo (Cowork sessie, 31 mei 2026)
**Doel:** De bestaande autonome trading bot vandaag live en werkend krijgen

---

## Hoe deze briefing te gebruiken

Plak deze hele tekst in je openings-bericht aan Claude Code, of zeg simpelweg: "Lees `AFMAAK_BRIEFING.md` in de repo en begin met Fase 1". Alles wat je nodig hebt om door te kunnen staat hier. Aanvullende context staat in Open Brain onder de tags `TRADER-MOMENTUM-1`, `TRADER-AFMAAK-PLAN` en `TRADER-LESSON-APPROVAL-FLOW`. Roep die op met `search_brain` als je dieper wil.

---

## Wat dit project is

Dit is `trader-agent`, een autonome paper-trading bot die ik op 17 april 2026 ben begonnen en daarna heb laten liggen. Hij draait op Railway als `trader-dashboard-production-87de.up.railway.app` en is gekoppeld aan Alpaca Paper Trading (API keys staan in Railway env, status bar zegt "Alpaca Paper · connected").

Strategie heet Momentum Breakout. Hij koopt zes-criteria-tegelijk-breakouts op tien grote US ETFs (SPY, QQQ, IWM, DIA, XLF, XLE, XLK, XLV, XLI, XLY), met harde stop op -2%, trailing op -3%, take profit op +5%, EOD close, max 3 posities tegelijk. De volledige spec staat in `docs/strategy.md` en `docs/risk-policy.md`.

## Wat al staat en werkt

Backend:
- `web/lib/alpaca.ts` is een volledig werkende Alpaca client (account, positions, orders, bars, quotes, clock, close)
- `web/lib/ai.ts` heeft Claude Sonnet/Opus en Gemini Flash/Pro helpers
- `web/lib/db.ts` praat met PostgreSQL via `pg`
- `web/app/api/cron/route.ts` heeft alle vijf routines geïmplementeerd met live Alpaca calls

Dashboard (Next.js, tien pagina's, dark Linear-stijl):
- Overview, Positions, Decision Log, Conversations, Routines, Risk & Guards, Strategy, Lessons, Reports, History
- Live hooks `useAccount` en `usePositions` werken via API routes
- Kill switch werkt server-side via `settings` tabel
- `web/lib/mock.ts` levert demo data als Alpaca niet beschikbaar is

Routines (in `web/app/api/cron/route.ts`):
- `premarket` 08:30 ET: scant ETFs, AI selecteert kandidaten
- `market-open` 09:35 ET: plaatst orders binnen position sizing guards
- `midday` 12:30 ET: status update per positie
- `eod` 16:10 ET: sluit alles, schrijft Nederlands EOD rapport
- `weekly` vrijdag 16:30: strategie review

## Wat NIET werkt en gebouwd moet worden

1. Cron jobs op Railway zijn niet geactiveerd, routines draaien dus nooit vanzelf
2. PostgreSQL tabellen voor `lessons`, `lesson_proposals`, `threads`, `thread_messages` bestaan nog niet
3. De Lessons AI-loop die nieuwe lessen voorstelt uit decision history en trade outcomes is mock
4. De Conversations interactiviteit (threads schrijven en agent laten antwoorden) is mock
5. De Reports pagina toont mock data in plaats van echte EOD reports uit DB
6. De Decision Log toont alleen voorbeeld-decisions, niet alle echte uit DB
7. De UI gebruikt nog de oude dark Linear-stijl, niet Mono Brand Baseline v0.9
8. Geen Telegram notificaties op key events
9. Geen Open Brain sync van weekly insights

---

## Het vijf-fasen afmaak plan

### Fase 1: Bot tot leven wekken

1. Verifieer Railway deployment status (`railway status` of dashboard)
2. Check welke env vars al gezet zijn in Railway, vul de ontbrekende aan: `ALPACA_API_KEY`, `ALPACA_API_SECRET`, `ALPACA_BASE_URL=https://paper-api.alpaca.markets`, `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`, `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `OPEN_BRAIN_URL`, `CRON_SECRET`
3. Verifieer dat PostgreSQL `decisions`, `agent_reports`, `settings` tabellen bestaan, run migraties zo nodig (zie `web/lib/db.ts` voor schemas)
4. Test elk routine endpoint handmatig met `curl -X POST` of via de Run-knoppen in de UI:
   - `POST /api/cron` met body `{"routine":"premarket"}` plus `Authorization: Bearer $CRON_SECRET`
   - Idem voor `market-open`, `midday`, `eod`, `weekly`
5. Activeer Railway cron jobs voor de 5 routines in ET tijdzone (let op: ET, niet UTC):
   - `premarket`: 30 8 * * 1-5
   - `market-open`: 35 9 * * 1-5
   - `midday`: 30 12 * * 1-5
   - `eod`: 10 16 * * 1-5
   - `weekly`: 30 16 * * 5

### Fase 2: Lessons AI-loop echt maken (de leer-laag)

Dit is het kernstuk waar Dusty van moet leren. Approval-flow is hard requirement.

1. Maak `lesson_proposals` tabel met status enum `'proposed' | 'seen' | 'approved' | 'rejected'`, kolommen: `id, title, description, category, confidence, trigger_human, trigger_code, gate_label, related_trade_ids, proposed_at, reviewed_at, reviewer_notes`
2. Maak `lessons` tabel voor actieve lessen, idem velden plus `activated_at, hits, pnl_impact, last_applied_at, status ('active' | 'paused' | 'archived')`
3. Bouw `runWeeklyReview()` uit zodat Claude Opus over de decision history en trade outcomes draait en lesson proposals genereert
4. Bouw de approval endpoints:
   - `POST /api/lessons/proposals/:id/approve` (verplaatst naar lessons tabel, activeert als gate)
   - `POST /api/lessons/proposals/:id/reject` met reason field
   - `POST /api/lessons/proposals/:id/seen` (status naar 'seen', badge weg)
5. Activeer goedgekeurde lessons als extra gates in `runMarketOpen()`: elke entry-check checkt ook alle active lessons met matching gate
6. Lessons pagina UI: drie expliciete knoppen per proposal: "Goedkeuren", "Afwijzen", "Markeer als gezien"
7. Notification badge op Lessons nav-item alleen voor status='proposed', niet voor 'seen'
8. **Open Brain sync**: bij elke nieuwe proposal én bij elke approve/reject, roep `capture_thought` aan met importance 2, summary "L-XXX: [titel]", tag `TRADER-LESSON`. Endpoint via env `OPEN_BRAIN_URL`.

**Approval-regel (hard):** geen enkele les wordt automatisch actief. Alle nieuwe regels altijd langs Dusty. Geen confidence threshold die auto-activeert. Dit is bewust, het is de leer-flow.

### Fase 3: Conversations interactief

1. Maak `threads` en `thread_messages` tabellen
2. In `runWeeklyReview()` of een nieuwe `runPatternDetection()` detecteert Claude Opus ongebruikelijke patronen en opent agent-initiated threads
3. User reply via dashboard `POST /api/conversations/:thread/reply` triggert Claude met volledige thread history + relevante decision context als input
4. Status mgmt: 'open', 'closed', mark-as-read

### Fase 4: UI restyle naar Mono Brand Baseline v0.9

Bron: `/Users/idusty/Documents/Cosmo OS/Mono by Dusty/Brand/brand-baseline.md` en `tokens.css`. Hard regels:

- Background warm off-white `#FAF8F3`, surface `#FFFFFF`
- Ink primary `#1A1A1A`, soft `#4A4A4A`, mute `#7A7A7A`
- Accent Mono Blue `#2B5BC4` als enige accent
- Lines warm tan `#E8E3D7`
- Status colors: Automate green `#5B8A3A`, Augment amber `#B07A1A`, Agent Mono Blue, Human muted purple
- Radius 14px cards, 8px sub-cards, 999px pills
- Font stack `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", Helvetica, Arial, sans-serif`
- Geen gradients, geen heavy shadows, max 200ms transitions
- **Geen em-dashes in copy**, vervang door komma, punt of herformuleer
- Eerste persoon ("ik") of derde persoon ("Dusty"), geen "wij van"
- Verwijder de mock-fallback overal, live data of explicit "geen data" state

### Fase 5: Observability via Telegram en Open Brain

1. Bouw `web/lib/telegram.ts` met `sendMessage(text)` via `TELEGRAM_BOT_TOKEN` en `TELEGRAM_CHAT_ID`
2. Triggers:
   - Elke BUY order: "Momentum-1 kocht 122x XLK op $238.44. Stop $233.67."
   - Elke hard stop hit: "XLK hard stop geraakt op $233.67. P&L -$166.40."
   - Elke kill switch trigger: wie heeft hem aangezet, op welk moment
   - Dagelijkse digest om 16:30 ET met EOD samenvatting
3. Open Brain sync via `capture_thought` voor:
   - Elke nieuwe lesson_proposal en approval/rejection (zie Fase 2)
   - Weekly review highlights (importance 2, tag `TRADER-WEEKLY`)
   - Significante drawdowns of P&L spikes (importance 2, tag `TRADER-EVENT`)

### Fase 6: Strategy Intelligence Upgrade

Onderzoek (31 mei 2026) wijst uit dat 70 tot 80 procent van retail bots verliest, en dat winnaars structureel zes dingen anders doen. De huidige Momentum-1 doet stops, position caps en kill switch goed, maar mist regime-awareness en ensemble-aanpak. Deze fase voegt dat toe.

1. **Regime detection laag**. Bouw een classifier (start eenvoudig: VIX-niveau + ADX op SPY + breadth indicator) die output geeft: `'trending_up' | 'trending_down' | 'range_bound' | 'high_vol'`. Sla op in `regimes` tabel met tijdstempel. Update elke 30 minuten tijdens markturen. Latere upgrade naar Hidden Markov Model.

2. **Tweede strategie naast momentum**. Implementeer `MeanReversion` strategie die alleen actief is in `range_bound` regime: koop op oversold RSI (<30) bij prijs onder onderkant Bollinger Band, verkoop op terugkeer naar middle band of stop bij doorbreek lower band. Strategieën leven in `src/strategies/` met gemeenschappelijke interface.

3. **Volatility-targeting position sizing**. Vervang vaste 25% door dynamische berekening: target portfolio volatility 12% jaarlijks, schaal positie omgekeerd evenredig met huidige 20-day realized vol van het symbool. Bovenop fractional Kelly cap (1/4 Kelly). Implementeer in `src/sizing/vol_target.ts`. Logging: voor elke order welke vol, welke Kelly, welke uiteindelijke size.

4. **Wekelijkse hypothesis loop met Claude Opus**. Elke vrijdag na EOD: Opus krijgt alle decisions, trades, en P&L van afgelopen 4 weken. Output: hypothesen over wat werkt en wat niet, plus voorgestelde aanpassingen. Voorgestelde aanpassingen worden geen lessons direct, ze worden eerst 6 weken paper-getest in een schaduw-tabel (`hypothesis_tests`). Na 6 weken: als positief resultaat, dan pas als lesson proposal naar Dusty voor approval.

5. **News/sentiment laag**. Gemini Flash draait elke ochtend over Reuters/MT Newswires headlines per symbol in de universe. Output JSON: `{symbol: {sentiment: -1..1, event_risk: low|med|high, summary: "..."}}`. Sla op in `sentiment_signals` tabel. `runMarketOpen()` checkt event_risk='high' als extra NO_GO gate.

### Fase 7: Cross-asset diversificatie via Crypto

Crypto correleert vaak negatief met aandelen, draait 24/7, en geeft de bot meer beslismomenten zonder extra kapitaal. Alpaca ondersteunt BTC en ETH paper trading.

1. Voeg BTC/USD en ETH/USD toe aan een aparte `crypto_universe` (niet de equity universe)
2. Maak een aparte `runCryptoCheck()` routine die elke 4 uur draait (niet alleen werkdagen, ook weekend)
3. Hergebruik momentum + mean reversion strategies, maar met aangepaste parameters (crypto vol is veel hoger, RSI thresholds anders, stops wijder)
4. Position sizing: maximaal 20% van portfolio in crypto, separate van equity allocation
5. Aparte dashboard sectie voor crypto P&L en posities

---

## Realistische verwachting (na onderzoek)

Geen jackpot. Geen 100% per jaar. Wat we redelijkerwijs kunnen mikken als deze upgrades goed werken:

- Jaarlijks bruto: 15-25%
- Maximum drawdown: 10-15%
- Sharpe ratio: 1.5 of hoger
- Win rate: 55-65%
- Vereist: minimaal 6 maanden paper trading bewijs voor ook één euro live gaat

Belangrijk: Casey's erfenis-bucket gaat NIET in deze bot. Die zit in passieve index funds (VWCE op DEGIRO of Trading 212), apart, niet aanraken tot Casey 18 is. De bot is bucket 2: experimenteel, missbaar, stapsgewijs opschalen na bewezen track record. Dit is hard kader, niet onderhandelbaar.

---

## Carte blanche en kaders

Dusty geeft volledige uitvoeringsruimte binnen deze grenzen:

1. **Strategie blijft Momentum Breakout zoals in `docs/strategy.md`** tot wijzigingen via goedgekeurde Lessons door Dusty zijn bevestigd
2. **Hard stops altijd actief**, niet omzeilbaar, niet uitstelbaar
3. **Max 3 posities**, **25% size**, **10% cash floor**
4. **Geen overnight holding**
5. **Alleen de 10 ETFs uit de Approved Universe**, geen substituten
6. **Paper trading only** in deze fase. Live trading komt pas wanneer Dusty expliciet zegt "we gaan live"

Alle copy en UI in **Nederlands**, **Mono brand stijl**, **geen em-dashes**, professioneel-warm Apple-stijl.

---

## Hoe de leer-laag bedoeld is

Dusty is geen ervaren trader. De bot is in de eerste plaats een leer-instrument voor hem, niet alleen een autonome P&L generator. Concreet:

- Bij elke beslissing geeft Cosmo (de bot) twee lagen uitleg: technisch ("RSI 64, breakout boven 5-day high $440.80 met volume 1.12x avg") en mens-taal ("QQQ trekt door een prijsplafond met meer kopers dan normaal, dat is een signaal dat ik wil meerijden")
- Eerste vermelding van een vakterm krijgt een korte uitleg in-line of als tooltip
- Aan het eind van elke dag schrijft Cosmo een "Vandaag leerde ik" reflectie in de Reports of via Telegram
- Lessons zijn jouw curriculum: elke les die Dusty goedkeurt is een concept dat hij heeft begrepen en aan zijn trading filosofie heeft toegevoegd

---

## Beginpunt voor deze Claude Code sessie

Eerste actie: doorlees deze briefing volledig, dan `cat docs/strategy.md` en `cat docs/risk-policy.md` om de regels te kennen, dan check Railway met `railway status` of het project bereikbaar is.

Vraag Dusty waar je niet doorkomt. Hij is niet de expert hier, hij verwacht dat jij voorstelt en hij goedkeurt. Doe één fase per keer, rapporteer voortgang in heldere taal, vermijd jargon zonder uitleg.

Doel voor vandaag: bot draait live, Lessons-loop genereert minimaal één voorstel dat Dusty kan goedkeuren, Telegram pingt bij de eerste BUY.

Succes.
