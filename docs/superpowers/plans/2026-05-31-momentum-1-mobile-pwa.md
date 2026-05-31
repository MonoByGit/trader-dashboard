# Momentum-1 Mobiele PWA — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een lichte, installeerbare "glanceable" mobiele PWA van het Momentum-1 dashboard met twee schermen (Glance + Rapport), auto-detect naar `/m`, en het Mono-beeldmerk als iPhone-icoon.

**Architecture:** Nieuw, geisoleerd route-segment `web/app/m/` met eigen layout. Hergebruikt de bestaande API-routes (alpaca/account, alpaca/positions, guards, decisions) plus een nieuwe GET op `/api/agent/report`. Auto-detect via `middleware.ts` (mobiele UA → `/m`) met cookie-escape-hatch. Stijl volgt systeem (`prefers-color-scheme`) via de al bestaande `[data-theme]`-tokens.

**Tech Stack:** Next.js (app router) in `web/`, TypeScript, Tailwind + `globals.css` CSS-variabelen, PostgreSQL via `lib/db.ts`, Alpaca via `lib/alpaca.ts`.

---

## Verificatiemodel (lees dit eerst)

Dit project heeft **geen unit-test-harness** (alleen `next lint`). `next dev`/`next build` hangt lokaal op het iCloud Documents-pad. De betrouwbare gate is daarom — conform `DEPLOY.md`:

```
cd web
npx tsc --noEmit
npm run lint
```

Plus na merge de GitHub CI + Railway-build, en een handmatige iPhone-check na deploy. Elke taak hieronder eindigt met die gate en een commit. Een jest/vitest-harness toevoegen valt buiten scope (YAGNI). Pure helpers worden als losse, leesbare functies geschreven met gedocumenteerde verwachte uitkomsten.

Werk op de bestaande branch `feat/mobile-pwa`. Commit per taak.

---

## Bestandsoverzicht

Nieuw:
- `web/app/icon-square.svg` — full-bleed (rx=0) bronvariant voor de PNG-iconen
- `web/public/icons/apple-touch-icon.png` (180x180)
- `web/public/icons/icon-192.png`, `web/public/icons/icon-512.png`
- `web/app/manifest.ts` — web app manifest (metadata-route)
- `web/app/m/layout.tsx` — mobiele layout (theme, meta, no-flash script)
- `web/app/m/page.tsx` — Glance
- `web/app/m/report/page.tsx` — Rapport
- `web/app/m/_components/StatHero.tsx`
- `web/app/m/_components/KillSwitchCard.tsx`
- `web/app/m/_components/PositionRow.tsx`
- `web/app/m/_components/DecisionRow.tsx`
- `web/app/m/_components/ReportCard.tsx`
- `web/app/m/_components/states.tsx` — Skeleton / ErrorState / EmptyState
- `web/hooks/useTrader.ts` — `useGuards`, `useDecisions`, `useReport`
- `web/middleware.ts` — auto-detect + escape-hatch

Gewijzigd:
- `web/app/api/agent/report/route.ts` — GET toevoegen (lees laatste `agent_reports`)
- `web/app/globals.css` — mobiele `.m-*` classes + safe-area
- `web/components/shell/DashboardShell.tsx` — "Mobiele weergave"-link in statusbar

---

## Task 1: PWA-iconen genereren uit het Mono-beeldmerk

**Files:**
- Create: `web/app/icon-square.svg`
- Create: `web/public/icons/apple-touch-icon.png`, `web/public/icons/icon-192.png`, `web/public/icons/icon-512.png`

iOS negeert SVG/manifest voor het homescreen-icoon: een 180x180 PNG apple-touch-icon is verplicht. We renderen alle PNG's uit een full-bleed (rx=0) variant van `web/app/icon.svg` zodat de hoeken nooit transparant zijn (iOS/Android maskeren zelf).

- [ ] **Step 1: Maak de full-bleed bron-SVG**

Create `web/app/icon-square.svg` — identiek aan `web/app/icon.svg` maar met `rx="0"` zodat het hele vlak gevuld is:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="0" fill="#1a1a1a"/>
  <g fill="#0d99ff">
    <path d="m452 78.67h-.72v-38.67c0-6.9-5.6-12.5-12.5-12.5s-12.5 5.6-12.5 12.5v38.67h-.72c-17.92 0-32.5 14.58-32.5 32.5v251.43c0 17.92 14.58 32.5 32.5 32.5h.72v38.67c0 6.9 5.6 12.5 12.5 12.5s12.5-5.6 12.5-12.5v-38.67h.72c17.92 0 32.5-14.58 32.5-32.5v-251.43c0-17.92-14.58-32.5-32.5-32.5z"/>
    <path d="m330.15 199.9h-.72v-19.17c0-6.9-5.6-12.5-12.5-12.5s-12.5 5.6-12.5 12.5v19.17h-.72c-17.92 0-32.5 14.58-32.5 32.5v187.92c0 17.92 14.58 32.5 32.5 32.5h.72v19.17c0 6.9 5.6 12.5 12.5 12.5s12.5-5.6 12.5-12.5v-19.17h.72c17.92 0 32.5-14.58 32.5-32.5v-187.92c0-17.92-14.58-32.5-32.5-32.5z"/>
    <path d="m208.3 158.71h-.72v-25.93c0-6.9-5.6-12.5-12.5-12.5s-12.5 5.6-12.5 12.5v25.93h-.72c-17.92 0-32.5 14.58-32.5 32.5v115.15c0 17.92 14.58 32.5 32.5 32.5h.72v25.93c0 6.9 5.6 12.5 12.5 12.5s12.5-5.6 12.5-12.5v-25.93h.72c17.92 0 32.5-14.58 32.5-32.5v-115.15c0-17.92-14.58-32.5-32.5-32.5z"/>
    <path d="m86.44 84.54h-.72v-44.54c0-6.9-5.6-12.5-12.5-12.5s-12.5 5.6-12.5 12.5v44.54h-.72c-17.92 0-32.5 14.58-32.5 32.5v232.12c0 17.92 14.58 32.5 32.5 32.5h.72v44.54c0 6.9 5.6 12.5 12.5 12.5s12.5-5.6 12.5-12.5v-44.54h.72c17.92 0 32.5-14.58 32.5-32.5v-232.12c0-17.92-14.58-32.5-32.5-32.5z"/>
  </g>
</svg>
```

- [ ] **Step 2: Render de drie PNG's**

Run (vanuit `web/`):

```bash
mkdir -p public/icons
npx --yes sharp-cli -i app/icon-square.svg -o public/icons/apple-touch-icon.png resize 180 180
npx --yes sharp-cli -i app/icon-square.svg -o public/icons/icon-192.png resize 192 192
npx --yes sharp-cli -i app/icon-square.svg -o public/icons/icon-512.png resize 512 512
```

Expected: drie PNG-bestanden in `web/public/icons/`. Verifieer afmetingen:

```bash
file public/icons/*.png
```

Expected output bevat `180 x 180`, `192 x 192`, `512 x 512`.

> Fallback als `sharp-cli` faalt (librsvg aanwezig): `rsvg-convert -w 180 -h 180 app/icon-square.svg -o public/icons/apple-touch-icon.png` (idem voor 192/512).

- [ ] **Step 3: Verifieer dat de PNG's niet leeg/transparant-aan-de-rand zijn**

Run: `node -e "const f=require('fs');for(const s of[180,192,512]){const n=s===180?'apple-touch-icon':'icon-'+s;const b=f.statSync('public/icons/'+n+'.png').size;console.log(n,b,'bytes');if(b<400)throw new Error('te klein: '+n)}"`
Expected: drie regels met >400 bytes, geen error.

- [ ] **Step 4: Commit**

```bash
git add web/app/icon-square.svg web/public/icons
git commit -m "feat(pwa): genereer apple-touch + manifest iconen uit Mono-beeldmerk"
```

---

## Task 2: Web app manifest

**Files:**
- Create: `web/app/manifest.ts`

- [ ] **Step 1: Schrijf de manifest-route**

Create `web/app/manifest.ts`:

```ts
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Momentum-1',
    short_name: 'Momentum-1',
    description: 'Momentum-1 trading dashboard, glanceable mobiele weergave',
    start_url: '/m',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#1a1a1a',
    background_color: '#1a1a1a',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
```

- [ ] **Step 2: Verifieer typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: geen errors. `/manifest.webmanifest` wordt door Next op build geserveerd.

- [ ] **Step 3: Commit**

```bash
git add web/app/manifest.ts
git commit -m "feat(pwa): web app manifest (Momentum-1, start_url /m)"
```

---

## Task 3: Mobiele layout, theme-detectie en meta

**Files:**
- Create: `web/app/m/layout.tsx`
- Modify: `web/app/globals.css` (mobiele `.m-*` classes onderaan toevoegen)

De root-layout (`web/app/layout.tsx`) zet `data-theme="dark"` hard. De `/m`-pagina's nestelen daarin. Een no-flash inline script overschrijft `data-theme` op `<html>` met de systeemvoorkeur en luistert op wijziging. De light-tokens bestaan al in `globals.css` onder `[data-theme="light"]`.

- [ ] **Step 1: Schrijf de mobiele layout**

Create `web/app/m/layout.tsx`:

```tsx
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Momentum-1',
  description: 'Glanceable mobiele weergave van het Momentum-1 dashboard',
  appleWebApp: {
    capable: true,
    title: 'Momentum-1',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#1a1a1a' },
    { media: '(prefers-color-scheme: light)', color: '#faf8f3' },
  ],
};

const themeScript = `(function(){try{var m=window.matchMedia('(prefers-color-scheme: light)');var apply=function(){document.documentElement.setAttribute('data-theme', m.matches?'light':'dark');};apply();m.addEventListener('change',apply);}catch(e){}})();`;

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      <div className="m-root">{children}</div>
    </>
  );
}
```

- [ ] **Step 2: Voeg de mobiele CSS toe onderaan `web/app/globals.css`**

Append aan het einde van `web/app/globals.css`:

```css
/* ===== Mobiele PWA (/m) ===== */
.m-root {
  min-height: 100dvh;
  background: var(--bg-app);
  color: var(--text-primary);
  padding: max(16px, env(safe-area-inset-top)) 16px calc(24px + env(safe-area-inset-bottom));
  max-width: 560px;
  margin: 0 auto;
}
.m-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.m-head .m-title { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 17px; }
.m-actions { display: flex; align-items: center; gap: 10px; }
.m-btn {
  min-height: 44px; min-width: 44px; display: inline-flex; align-items: center; justify-content: center;
  gap: 6px; padding: 0 14px; border-radius: 12px;
  background: var(--bg-card); border: 1px solid var(--border-subtle);
  color: var(--text-primary); font-size: 14px; font-family: inherit;
}
.m-btn:active { background: var(--bg-card-hover); }
.m-card {
  background: var(--bg-card); border: 1px solid var(--border-subtle);
  border-radius: 16px; padding: 16px; margin-bottom: 12px;
}
.m-card-title { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-tertiary); margin-bottom: 12px; }
.m-hero-equity { font-size: 34px; font-weight: 600; letter-spacing: -0.02em; }
.m-hero-pnl { font-size: 16px; margin-top: 4px; }
.m-pos { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-top: 1px solid var(--border-subtle); }
.m-pos:first-of-type { border-top: 0; }
.m-pos-sym { font-weight: 600; font-size: 15px; }
.m-pos-meta { font-size: 12px; color: var(--text-tertiary); margin-top: 2px; }
.m-dec { padding: 10px 0; border-top: 1px solid var(--border-subtle); font-size: 13px; }
.m-dec:first-of-type { border-top: 0; }
.m-dec-top { display: flex; gap: 8px; align-items: baseline; }
.m-dec-rat { color: var(--text-secondary); margin-top: 3px; line-height: 1.45; }
.m-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.m-pos-val { text-align: right; }
.text-pos { color: var(--pos); }
.text-neg { color: var(--neg); }
.m-mkt-pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-secondary); }
.m-mkt-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-tertiary); }
.m-mkt-dot.open { background: var(--pos); }
.m-skel { background: var(--bg-card-hover); border-radius: 8px; height: 14px; opacity: .6; }
.m-foot { margin-top: 18px; text-align: center; }
.m-foot a { color: var(--text-tertiary); font-size: 13px; text-decoration: none; }
.m-narrative { white-space: pre-wrap; line-height: 1.55; color: var(--text-secondary); font-size: 14px; }
```

- [ ] **Step 3: Verifieer typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: geen errors.

- [ ] **Step 4: Commit**

```bash
git add web/app/m/layout.tsx web/app/globals.css
git commit -m "feat(m): mobiele layout met systeem-thema en PWA-meta + mobiele styles"
```

---

## Task 4: GET op `/api/agent/report` (laatste opgeslagen EOD-rapport)

**Files:**
- Modify: `web/app/api/agent/report/route.ts`

De bestaande POST genereert live via Claude — niet aanroepen bij page-load. We voegen een GET toe die de laatste rij uit `agent_reports` leest (`kpis` is JSONB → pg geeft een object terug).

- [ ] **Step 1: Voeg db-import en GET toe**

Wijzig de importregel bovenaan `web/app/api/agent/report/route.ts` van:

```ts
import { NextResponse } from 'next/server';
import { alpaca } from '@/lib/alpaca';
import { claudeText, MODELS } from '@/lib/ai';
```

naar:

```ts
import { NextResponse } from 'next/server';
import { alpaca } from '@/lib/alpaca';
import { claudeText, MODELS } from '@/lib/ai';
import { dbQuery, initDb, hasDb } from '@/lib/db';
```

Voeg vóór de bestaande `export async function POST()` deze GET toe:

```ts
export async function GET() {
  if (!hasDb()) return NextResponse.json(null);
  try {
    await initDb();
    const rows = await dbQuery<{
      id: string;
      date: string;
      generated_at: string;
      kpis: { equityStart?: number; equityEnd?: number; closed?: number } | null;
      narrative: string | null;
    }>(
      `SELECT id, date, generated_at, kpis, narrative
       FROM agent_reports ORDER BY generated_at DESC LIMIT 1`
    );
    return NextResponse.json(rows[0] ?? null);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verifieer typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: geen errors.

- [ ] **Step 3: Commit**

```bash
git add web/app/api/agent/report/route.ts
git commit -m "feat(api): GET /api/agent/report leest laatste opgeslagen EOD-rapport"
```

---

## Task 5: Data-hooks voor guards, decisions en report

**Files:**
- Create: `web/hooks/useTrader.ts`

Volgt het patroon van `web/hooks/useAlpaca.ts` (`{ data, error, loading, refresh }`). `useAccount` en `usePositions` worden hergebruikt uit `useAlpaca.ts`.

- [ ] **Step 1: Schrijf de hooks**

Create `web/hooks/useTrader.ts`:

```ts
'use client';
import { useState, useEffect, useCallback } from 'react';

export interface Decision {
  id: string;
  ts: string;
  routine: string;
  symbol: string | null;
  decision: string;
  rationale: string | null;
  confidence: number | null;
}

export interface ReportData {
  id: string;
  date: string;
  generated_at: string;
  kpis: { equityStart?: number; equityEnd?: number; closed?: number } | null;
  narrative: string | null;
}

export function useGuards() {
  const [tradingEnabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/guards');
      if (!res.ok) throw new Error(`${res.status}`);
      const d = await res.json();
      setEnabled(!!d.tradingEnabled);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const setTrading = useCallback(async (next: boolean) => {
    const prev = tradingEnabled;
    setEnabled(next); // optimistisch
    setSaving(true);
    try {
      const res = await fetch('/api/guards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradingEnabled: next, who: 'Dusty (mobiel)' }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
    } catch (e) {
      setEnabled(prev); // terugdraaien
      setError(String(e));
      throw e;
    } finally {
      setSaving(false);
    }
  }, [tradingEnabled]);

  useEffect(() => { refresh(); }, [refresh]);
  return { tradingEnabled, error, saving, refresh, setTrading };
}

export function useDecisions(limit = 5) {
  const [data, setData] = useState<Decision[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/decisions?limit=${limit}`);
      if (!res.ok) throw new Error(`${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => { refresh(); }, [refresh]);
  return { data, error, loading, refresh };
}

export function useReport() {
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/agent/report');
      if (!res.ok) throw new Error(`${res.status}`);
      const d = await res.json();
      setData(d && !d.error ? d : null);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  return { data, error, loading, refresh };
}
```

- [ ] **Step 2: Verifieer typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: geen errors.

- [ ] **Step 3: Commit**

```bash
git add web/hooks/useTrader.ts
git commit -m "feat(m): data-hooks voor guards, decisions en report"
```

---

## Task 6: Gedeelde state-componenten

**Files:**
- Create: `web/app/m/_components/states.tsx`

- [ ] **Step 1: Schrijf de state-helpers**

Create `web/app/m/_components/states.tsx`:

```tsx
export function Skeleton({ lines = 2 }: { lines?: number }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="m-skel" style={{ width: i === 0 ? '60%' : '90%' }} />
      ))}
    </div>
  );
}

export function ErrorState({ msg = 'Kan niet laden' }: { msg?: string }) {
  return <div style={{ color: 'var(--neg)', fontSize: 13 }}>{msg}</div>;
}

export function EmptyState({ msg }: { msg: string }) {
  return <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>{msg}</div>;
}
```

- [ ] **Step 2: Verifieer typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: geen errors.

- [ ] **Step 3: Commit**

```bash
git add web/app/m/_components/states.tsx
git commit -m "feat(m): skeleton/error/empty state-componenten"
```

---

## Task 7: Glance-componenten

**Files:**
- Create: `web/app/m/_components/StatHero.tsx`
- Create: `web/app/m/_components/PositionRow.tsx`
- Create: `web/app/m/_components/DecisionRow.tsx`
- Create: `web/app/m/_components/KillSwitchCard.tsx`

- [ ] **Step 1: StatHero**

Create `web/app/m/_components/StatHero.tsx`:

```tsx
import { fmt } from '@/lib/format';

interface Props {
  equity: number | null | undefined;
  dayPnl: number | null | undefined;
  dayPnlPct: number | null | undefined; // fractie, bv 0.012 = +1,2%
  marketOpen: boolean | undefined;
}

export function StatHero({ equity, dayPnl, dayPnlPct, marketOpen }: Props) {
  const pos = (dayPnl ?? 0) >= 0;
  const pctVal = dayPnlPct == null ? null : dayPnlPct * 100;
  return (
    <div className="m-card">
      <div className="m-row">
        <span className="m-card-title">Equity</span>
        <span className="m-mkt-pill">
          <span className={`m-mkt-dot ${marketOpen ? 'open' : ''}`} />
          Markt {marketOpen ? 'open' : 'dicht'}
        </span>
      </div>
      <div className="m-hero-equity mono">{fmt.usd(equity, 2)}</div>
      <div className={`m-hero-pnl mono ${pos ? 'text-pos' : 'text-neg'}`}>
        {fmt.signedUsd(dayPnl)} ({fmt.pct(pctVal)}) vandaag
      </div>
    </div>
  );
}
```

- [ ] **Step 2: PositionRow**

Create `web/app/m/_components/PositionRow.tsx`. Stop/target afgeleid van de broker-bracket (-2% / +5%) op `avgEntryPrice`:

```tsx
import { fmt } from '@/lib/format';

interface Props {
  symbol: string;
  qty: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number; // al in procenten (route * 100)
}

export function PositionRow({ symbol, qty, avgEntryPrice, currentPrice, unrealizedPnl, unrealizedPnlPct }: Props) {
  const pos = unrealizedPnl >= 0;
  const stop = avgEntryPrice * 0.98;
  const target = avgEntryPrice * 1.05;
  return (
    <div className="m-pos">
      <div>
        <div className="m-pos-sym">{symbol} <span className="text-tertiary" style={{ fontWeight: 400 }}>{qty}x</span></div>
        <div className="m-pos-meta mono">
          @ {fmt.usd(currentPrice)} · stop {fmt.usd(stop)} · target {fmt.usd(target)}
        </div>
      </div>
      <div className="m-pos-val">
        <div className={`mono ${pos ? 'text-pos' : 'text-neg'}`}>{fmt.signedUsd(unrealizedPnl)}</div>
        <div className={`m-pos-meta mono ${pos ? 'text-pos' : 'text-neg'}`}>{fmt.pct(unrealizedPnlPct)}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: DecisionRow**

Create `web/app/m/_components/DecisionRow.tsx`:

```tsx
import { fmt } from '@/lib/format';
import type { Decision } from '@/hooks/useTrader';

export function DecisionRow({ d }: { d: Decision }) {
  return (
    <div className="m-dec">
      <div className="m-dec-top">
        <span style={{ fontWeight: 600 }}>{d.symbol ?? d.routine}</span>
        <span className="text-tertiary mono" style={{ fontSize: 11 }}>{d.decision}</span>
        <span className="text-tertiary" style={{ marginLeft: 'auto', fontSize: 11 }}>{fmt.relTime(d.ts)}</span>
      </div>
      {d.rationale && <div className="m-dec-rat">{d.rationale}</div>}
    </div>
  );
}
```

- [ ] **Step 4: KillSwitchCard**

Create `web/app/m/_components/KillSwitchCard.tsx`. Hergebruikt de bestaande `Toggle` en vraagt bevestiging via `window.confirm`:

```tsx
'use client';
import { Toggle } from '@/components/ui/Toggle';

interface Props {
  tradingEnabled: boolean | null;
  saving: boolean;
  onToggle: (next: boolean) => void;
}

export function KillSwitchCard({ tradingEnabled, saving, onToggle }: Props) {
  const on = tradingEnabled === true;
  const handle = (next: boolean) => {
    if (tradingEnabled == null) return;
    const msg = next
      ? 'Trading weer AANzetten? De bot mag dan weer posities openen.'
      : 'Kill switch: trading UITzetten? De bot opent geen nieuwe posities meer.';
    if (window.confirm(msg)) onToggle(next);
  };
  return (
    <div className="m-card">
      <div className="m-row">
        <div>
          <div className="m-card-title" style={{ marginBottom: 4 }}>Kill switch</div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            {tradingEnabled == null ? 'Laden...' : on ? 'Trading staat aan' : 'Trading staat uit'}
            {saving && ' · opslaan...'}
          </div>
        </div>
        <Toggle on={on} kill onChange={handle} aria-label="Kill switch" />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verifieer typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: geen errors.

- [ ] **Step 6: Commit**

```bash
git add web/app/m/_components
git commit -m "feat(m): glance-componenten (hero, positie, beslissing, kill switch)"
```

---

## Task 8: Glance-pagina

**Files:**
- Create: `web/app/m/page.tsx`

- [ ] **Step 1: Schrijf de Glance-pagina**

Create `web/app/m/page.tsx`:

```tsx
'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { BrandLogo } from '@/components/ui/Icon';
import { useAccount, usePositions } from '@/hooks/useAlpaca';
import { useGuards, useDecisions } from '@/hooks/useTrader';
import { StatHero } from './_components/StatHero';
import { KillSwitchCard } from './_components/KillSwitchCard';
import { PositionRow } from './_components/PositionRow';
import { DecisionRow } from './_components/DecisionRow';
import { Skeleton, ErrorState, EmptyState } from './_components/states';

export default function GlancePage() {
  const account = useAccount(60000);
  const positions = usePositions(60000);
  const guards = useGuards();
  const decisions = useDecisions(5);

  const refreshAll = () => { account.refresh(); positions.refresh(); guards.refresh(); decisions.refresh(); };

  useEffect(() => {
    const onFocus = () => refreshAll();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main>
      <div className="m-head">
        <span className="m-title"><BrandLogo size={22} /> Momentum-1</span>
        <div className="m-actions">
          <Link className="m-btn" href="/m/report">Rapport</Link>
          <button className="m-btn" onClick={refreshAll} aria-label="Vernieuwen">↻</button>
        </div>
      </div>

      {account.error
        ? <div className="m-card"><ErrorState /></div>
        : account.loading
          ? <div className="m-card"><Skeleton lines={2} /></div>
          : <StatHero equity={account.data?.equity} dayPnl={account.data?.dayPnl} dayPnlPct={account.data?.dayPnlPct} marketOpen={account.data?.marketOpen} />}

      <KillSwitchCard tradingEnabled={guards.tradingEnabled} saving={guards.saving} onToggle={(n) => guards.setTrading(n).catch(() => {})} />

      <div className="m-card">
        <div className="m-card-title">Open posities</div>
        {positions.error
          ? <ErrorState />
          : positions.loading
            ? <Skeleton lines={3} />
            : positions.data.length === 0
              ? <EmptyState msg="Geen open posities" />
              : positions.data.map((p) => (
                  <PositionRow key={p.symbol} symbol={p.symbol} qty={p.qty} avgEntryPrice={p.avgEntryPrice} currentPrice={p.currentPrice} unrealizedPnl={p.unrealizedPnl} unrealizedPnlPct={p.unrealizedPnlPct} />
                ))}
      </div>

      <div className="m-card">
        <div className="m-card-title">Laatste beslissingen</div>
        {decisions.error
          ? <ErrorState />
          : decisions.loading
            ? <Skeleton lines={3} />
            : decisions.data.length === 0
              ? <EmptyState msg="Nog geen beslissingen" />
              : decisions.data.map((d) => <DecisionRow key={d.id} d={d} />)}
      </div>

      <div className="m-foot">
        <a href="/?desktop=1">Open desktopversie</a>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verifieer typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: geen errors.

- [ ] **Step 3: Commit**

```bash
git add web/app/m/page.tsx
git commit -m "feat(m): glance-scherm met equity, kill switch, posities en beslissingen"
```

---

## Task 9: Rapport-scherm

**Files:**
- Create: `web/app/m/_components/ReportCard.tsx`
- Create: `web/app/m/report/page.tsx`

- [ ] **Step 1: ReportCard**

Create `web/app/m/_components/ReportCard.tsx`:

```tsx
import { fmt } from '@/lib/format';
import type { ReportData } from '@/hooks/useTrader';

export function ReportCard({ r }: { r: ReportData }) {
  const start = r.kpis?.equityStart;
  const end = r.kpis?.equityEnd;
  const pnl = start != null && end != null ? end - start : null;
  const pos = (pnl ?? 0) >= 0;
  return (
    <div className="m-card">
      <div className="m-row">
        <span className="m-card-title">EOD-rapport</span>
        <span className="text-tertiary" style={{ fontSize: 12 }}>{fmt.date(r.date)}</span>
      </div>
      {start != null && end != null && (
        <div className="m-row" style={{ marginBottom: 12 }}>
          <span className="mono">{fmt.usd(start)} → {fmt.usd(end)}</span>
          {pnl != null && <span className={`mono ${pos ? 'text-pos' : 'text-neg'}`}>{fmt.signedUsd(pnl)}</span>}
        </div>
      )}
      {r.narrative
        ? <div className="m-narrative">{r.narrative}</div>
        : <div className="text-tertiary" style={{ fontSize: 13 }}>Geen tekst in dit rapport</div>}
    </div>
  );
}
```

- [ ] **Step 2: Rapport-pagina**

Create `web/app/m/report/page.tsx`:

```tsx
'use client';
import Link from 'next/link';
import { BrandLogo } from '@/components/ui/Icon';
import { useReport } from '@/hooks/useTrader';
import { ReportCard } from '../_components/ReportCard';
import { Skeleton, ErrorState, EmptyState } from '../_components/states';

export default function ReportPage() {
  const { data, error, loading, refresh } = useReport();
  return (
    <main>
      <div className="m-head">
        <span className="m-title"><BrandLogo size={22} /> Rapport</span>
        <div className="m-actions">
          <Link className="m-btn" href="/m">Glance</Link>
          <button className="m-btn" onClick={refresh} aria-label="Vernieuwen">↻</button>
        </div>
      </div>

      {error
        ? <div className="m-card"><ErrorState /></div>
        : loading
          ? <div className="m-card"><Skeleton lines={4} /></div>
          : !data
            ? <div className="m-card"><EmptyState msg="Nog geen rapport beschikbaar" /></div>
            : <ReportCard r={data} />}

      <div className="m-foot">
        <a href="/?desktop=1">Open desktopversie</a>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verifieer typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: geen errors.

- [ ] **Step 4: Commit**

```bash
git add web/app/m/_components/ReportCard.tsx web/app/m/report/page.tsx
git commit -m "feat(m): rapport-scherm leest laatste EOD-rapport"
```

---

## Task 10: Auto-detect middleware met escape-hatch

**Files:**
- Create: `web/middleware.ts`

Mobiele User-Agent op `/` → redirect naar `/m`. `/?desktop=1` zet een jaar-cookie `view=desktop` die de redirect uitschakelt. iPads rapporteren een desktop-UA op iPadOS en blijven dus op de desktop (bewust: groot scherm).

- [ ] **Step 1: Schrijf de middleware**

Create `web/middleware.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';

const MOBILE_RE = /Android|iPhone|iPod|Windows Phone|BlackBerry|webOS|Opera Mini|IEMobile/i;

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname !== '/') return NextResponse.next();

  // Escape-hatch: forceer desktop en onthoud het.
  if (req.nextUrl.searchParams.get('desktop') === '1') {
    const res = NextResponse.next();
    res.cookies.set('view', 'desktop', { path: '/', maxAge: 60 * 60 * 24 * 365 });
    return res;
  }

  if (req.cookies.get('view')?.value === 'desktop') return NextResponse.next();

  const ua = req.headers.get('user-agent') ?? '';
  if (MOBILE_RE.test(ua)) {
    const url = req.nextUrl.clone();
    url.pathname = '/m';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: '/' };
```

- [ ] **Step 2: Verifieer typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: geen errors.

- [ ] **Step 3: Commit**

```bash
git add web/middleware.ts
git commit -m "feat(m): auto-detect mobiele UA naar /m met desktop escape-hatch"
```

---

## Task 11: "Mobiele weergave"-link op de desktop

**Files:**
- Modify: `web/components/shell/DashboardShell.tsx`

- [ ] **Step 1: Voeg de link toe in de statusbar (`.right`)**

In `web/components/shell/DashboardShell.tsx`, in het `<div className="right">`-blok van de statusbar, vervang:

```tsx
          <span>v0.1.0-paper</span>
```

door:

```tsx
          <span>v0.1.0-paper</span>
          <a href="/m" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Mobiele weergave</a>
```

- [ ] **Step 2: Verifieer typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: geen errors.

- [ ] **Step 3: Commit**

```bash
git add web/components/shell/DashboardShell.tsx
git commit -m "feat(m): link naar mobiele weergave in desktop-statusbar"
```

---

## Task 12: Eindverificatie en PR

- [ ] **Step 1: Volledige gate lokaal**

Run (vanuit `web/`): `npx tsc --noEmit && npm run lint`
Expected: beide groen, geen errors/warnings die de build breken.

- [ ] **Step 2: Push en open PR**

```bash
git push -u origin feat/mobile-pwa
gh pr create --base main --title "Mobiele Momentum-1 PWA (glanceable /m)" \
  --body "Lichte installeerbare PWA met Glance + Rapport, auto-detect naar /m, Mono-icoon, systeem-thema. Hergebruikt bestaande API-routes; nieuw alleen GET /api/agent/report. Spec en plan in docs/superpowers/."
```

Expected: PR aangemaakt; GitHub Actions CI (typecheck + lint + build) draait.

- [ ] **Step 3: Wacht op groene CI, merge, laat Railway deployen**

Volg `DEPLOY.md`: CI groen → merge → Railway auto-deploy `main`.

- [ ] **Step 4: Handmatige iPhone-verificatie (na deploy)**

- Open de productie-URL op iPhone Safari → moet automatisch naar `/m` redirecten.
- "Deel" → "Zet op beginscherm": icoon = Mono-beeldmerk (blauw op donker), naam "Momentum-1".
- Open vanaf homescreen (standalone): Glance toont equity/P&L, posities met stops, beslissingen; kill switch toggelt met bevestiging; Rapport-scherm toont laatste EOD of nette lege staat.
- Wissel iPhone tussen licht/donker → thema volgt.
- "Open desktopversie" → desktop laadt en blijft desktop (cookie gezet).

---

## Self-review (uitgevoerd)

- **Spec-dekking:** stijl dark+light/systeem (Task 3), twee schermen Glance+Rapport (Task 8, 9), auto-detect+escape (Task 10), icoon/manifest/apple-touch (Task 1, 2, 3), hergebruik API-routes + nieuwe GET report (Task 4, 5), kill switch met bevestiging (Task 7), foutstaten (Task 6), cross-links (Task 8, 9, 11), verificatie tsc+lint+CI+iPhone (Task 12). Alle spec-secties gedekt.
- **Placeholders:** geen TODO/TBD; alle code volledig.
- **Type-consistentie:** `Decision`/`ReportData` gedefinieerd in `useTrader.ts` (Task 5) en gebruikt in Task 7/9. `useAccount`/`usePositions` velden komen overeen met `useAlpaca.ts`. `Toggle`-props (`on`, `onChange`, `kill`, `aria-label`) komen overeen met de bestaande component. `fmt`-methodes bestaan in `lib/format.ts`. `unrealizedPnlPct` is al in procenten (positions-route `* 100`); `dayPnlPct` is een fractie en wordt in `StatHero` `* 100` gedaan.
