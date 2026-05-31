# Momentum-1 — Mobiele PWA (glanceable) — Ontwerp

Datum: 2026-05-31
Status: goedgekeurd door Dusty (brainstorm)
Repo: github.com/MonoByGit/trader-dashboard — Next.js app in `web/`

## Doel

Een lichte, "glanceable" mobiele versie van het Momentum-1 trading dashboard,
installeerbaar als PWA op het iPhone-homescreen. Niet de volledige desktop op
mobiel proppen. De Telegram-interface blijft ongemoeid. Geen nieuwe backend:
hergebruik de bestaande API-routes.

## Vastgelegde keuzes (brainstorm 31 mei 2026)

1. **Stijl:** huidige dark Linear-stijl. Aanvulling: ook een light-variant, die
   automatisch volgt op de systeeminstelling (`prefers-color-scheme`).
2. **Inhoud:** twee schermen — Glance + Rapport.
3. **Routing:** auto-detect (mobiele User-Agent redirect naar `/m`), met
   escape-hatch in beide richtingen zodat het nooit een val wordt.

## Architectuur & routing

Nieuw, geisoleerd route-segment `web/app/m/` — raakt de desktop-code niet.

- `web/app/m/layout.tsx` — eigen minimale layout (geen desktop-sidebar),
  safe-area insets, `viewport-fit=cover`, apple-touch-icon + theme-color meta,
  no-flash theme-script (zie Stijl).
- `web/app/m/page.tsx` — **Glance**.
- `web/app/m/report/page.tsx` — **Rapport**.
- `web/middleware.ts` — auto-detect: mobiele User-Agent op pad `/` → redirect
  naar `/m`. Escape-hatch: query `?desktop=1` zet cookie `view=desktop` die de
  redirect uitschakelt. "Open desktopversie"-link op `/m`; "Mobiele weergave"-link
  op de desktop. Desktop-UA blijft altijd op `/`.

## PWA-installeerbaarheid & icoon

- `web/app/manifest.ts` (Next metadata-route): `name`/`short_name` "Momentum-1",
  `start_url: "/m"`, `display: standalone`, `theme_color: "#1a1a1a"`,
  `background_color: "#1a1a1a"`, icons 192 + 512.
- Iconen gegenereerd uit `web/app/icon.svg` (vier-balks Mono-mark `#0d99ff` op
  `#1a1a1a`, rx=96) naar `web/public/icons/`:
  - `apple-touch-icon.png` 180x180 — full-bleed vierkant, dark bg, geen eigen
    afronding (iOS maskt zelf de hoeken).
  - `icon-192.png` + `icon-512.png` voor manifest/Android.
  - PNG's worden lokaal gegenereerd en gecommit (niet at-build). Toolkeuze op
    de Mac (rsvg-convert / sharp / sips-keten); de keten wordt in het plan
    vastgelegd.
- iOS negeert SVG/manifest voor het homescreen-icoon, daarom is de
  `<link rel="apple-touch-icon">` 180x180 PNG verplicht.

## Datastromen (hergebruik bestaande routes, geen nieuwe backend)

### Glance (`/m`)
Client fetch on mount + expliciete refresh-knop + refetch on window focus.
Geen agressieve polling (spaart Alpaca rate limits).

- `GET /api/alpaca/account` → `equity`, `dayPnl`, `dayPnlPct`, `marketOpen`,
  `nextOpen`/`nextClose`, `tradingBlocked`. Hero bovenaan.
- `GET /api/alpaca/positions` → posities (`symbol`, `qty`, `avgEntryPrice`,
  `currentPrice`, `unrealizedPnl`, `unrealizedPnlPct`). Stop/target afgeleid
  van `avgEntryPrice`: stop = entry × 0.98 (-2%), target = entry × 1.05 (+5%),
  conform de live broker-afgedwongen bracket-regels.
- `GET /api/guards` → `tradingEnabled` (kill-switch-stand). Toggle via
  `POST /api/guards { tradingEnabled, who: "Dusty (mobiel)" }` met
  bevestigingsdialoog (optimistisch togglen, terugdraaien bij fout).
- `GET /api/decisions?limit=5` → laatste beslissingen compact (routine, symbol,
  decision, rationale-kort, ts).

### Rapport (`/m/report`)
- **Nieuw:** `GET /api/agent/report` toevoegen die de laatste rij uit
  `agent_reports` leest (`date`, `generated_at`, `kpis` JSON, `narrative`).
  De bestaande POST (live Claude EOD-generatie) blijft ongemoeid. Geen
  Claude-aanroep bij page-load. Leeg/geen-DB → nette "nog geen rapport"-staat.
- `agent_reports` wordt al weggeschreven door `runEod()` in
  `web/app/api/cron/route.ts` (geverifieerd).

## Componenten & stijl

- Mobiel-eigen, lichte componenten co-located in `web/app/m/`: `StatHero`,
  `KillSwitchCard`, `PositionRow`, `DecisionRow`, `ReportCard`. Losgekoppeld van
  desktop-componenten (eigen, klein, testbaar oppervlak).
- Hergebruik `BrandLogo` (`web/components/ui/Icon.tsx`) in de header en `Toggle`
  (`web/components/ui/Toggle.tsx`) voor de kill-switch.
- Dark + light Linear-stijl via de **bestaande** CSS-variabelen in
  `web/app/globals.css` (`:root` = dark, `[data-theme="light"]` = light al
  aanwezig). Geen nieuwe tokens nodig.
- **Light/dark = systeem-gestuurd:** een no-flash inline script in `m/layout.tsx`
  zet `data-theme` op `<html>` uit `matchMedia("(prefers-color-scheme: dark)")`
  voor de eerste paint, en luistert op wijziging zodat wisselen direct doorwerkt.
  `theme-color` meta met `media`-varianten per scheme.
- Mobile-first: een kolom, tap-targets >= 44px, NL copy, geen em-dashes.

## Foutafhandeling & states

Per sectie: skeleton bij laden, nette fallback bij error ("kan niet laden"),
lege staat ("geen open posities" / "nog geen rapport"). Markt dicht → pill.
Kill-switch: bevestigen → optimistisch togglen → bij POST-fout terugdraaien +
melding.

## Verificatie & deploy

- Lokaal hangt `next dev`/`next build` op het iCloud Documents-pad
  (webpack file-watcher). Verifieer daarom met `npx tsc --noEmit` + `npm run lint`.
- GitHub Actions CI + Railway doen de echte build. Route: feature branch → PR →
  CI groen → merge → Railway auto-deploy `main` (zie `DEPLOY.md`).
- Na deploy: handmatig verifieren op iPhone — installeren op homescreen, icoon
  controleren, beide schermen, kill-switch toggle, light/dark wissel.

## YAGNI-grenzen (bewust buiten scope)

- Geen aparte mobiele nav-balk (twee schermen met simpele heen/terug-link).
- Geen push-notificaties (Telegram dekt dit al).
- Geen offline-caching/service-worker logica voorbij wat de manifest nodig heeft
  voor installeerbaarheid.
- Geen wijziging aan de Telegram-interface of de cron-routines.
