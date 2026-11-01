'use client';

import './mobile.css';
import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Icon, BrandLogo } from '@/components/ui/Icon';
import { fmt } from '@/lib/format';
import type { Portfolio, Position } from '@/lib/mock';
import { buildLivePortfolio, DEFAULT_GUARDS, intradayFromAccount } from '@/lib/live-portfolio';
import { useAccount, usePositions } from '@/hooks/useAlpaca';
import { Sheet } from './Sheet';
import { Sparkline } from './Sparkline';
import { MobileOverview } from './MobileOverview';
import { MobileActivity, type MDecision, badgeClass } from './MobileActivity';
import { MobileMore } from './MobileMore';
import { MobileBoard } from './MobileBoard';

type TabId = 'overview' | 'activity' | 'board' | 'more';
const TABS: { id: TabId; label: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
  { id: 'overview', label: 'Overzicht', icon: 'dashboard' },
  { id: 'activity', label: 'Activiteit', icon: 'log' },
  { id: 'board', label: 'Samen', icon: 'chat' },
  { id: 'more', label: 'Meer', icon: 'more' },
];

function mapDecisions(raw: unknown[]): MDecision[] {
  return raw.map((row) => {
    const d = row as Record<string, unknown>;
    return {
      id: String(d.id ?? ''),
      ts: String(d.ts ?? d.created_at ?? ''),
      routine: String(d.routine ?? ''),
      symbol: String(d.symbol ?? ''),
      decision: String(d.decision ?? ''),
      agentNote: String(d.agent_note ?? d.agentNote ?? ''),
      rationale: String(d.rationale ?? ''),
      criteria: (d.criteria as Record<string, string>) ?? null,
      orderId: d.order_id ? String(d.order_id) : null,
    };
  });
}

export function MobileApp() {
  const [tab, setTab] = useState<TabId>(() => {
    try { return (localStorage.getItem('trader-m-tab') as TabId) || 'overview'; } catch { return 'overview'; }
  });
  const live = useAccount(30000);
  const livePositions = usePositions(15000);
  const [guards, setGuards] = useState(DEFAULT_GUARDS);
  const [decisions, setDecisions] = useState<MDecision[]>([]);
  const [selPos, setSelPos] = useState<Position | null>(null);
  const [selDec, setSelDec] = useState<MDecision | null>(null);
  const [confirmClose, setConfirmClose] = useState<Position | null>(null);
  const [confirmKill, setConfirmKill] = useState(false);
  const [equityOpen, setEquityOpen] = useState(false);
  const [drawerTop, setDrawerTop] = useState(0);
  const heroRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [boardTodo, setBoardTodo] = useState(0);

  useEffect(() => { try { localStorage.setItem('trader-m-tab', tab); } catch {} }, [tab]);
  const toggleEquity = () => setEquityOpen(o => { if (!o && heroRef.current) setDrawerTop(Math.round(heroRef.current.getBoundingClientRect().bottom)); return !o; });

  useEffect(() => {
    fetch('/api/guards').then(r => r.json()).then(d => setGuards(g => ({ ...g, ...d }))).catch(() => null);
    fetch('/api/decisions?limit=200')
      .then(r => r.json())
      .then(d => setDecisions(Array.isArray(d) ? mapDecisions(d) : []))
      .catch(() => setDecisions([]));
  }, []);

  useEffect(() => {
    const poll = () => fetch('/api/threads').then(r => r.json()).then(d => setBoardTodo(d?.counts?.todo ?? 0)).catch(() => null);
    poll();
    const iv = setInterval(poll, 30000);
    return () => clearInterval(iv);
  }, [tab]);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3200); };

  const effPortfolio: Portfolio = useMemo(
    () => ({
      ...buildLivePortfolio(live.data, livePositions.data, guards.tradingEnabled),
      circuitBreakerTripped: guards.circuitBreakerTripped ?? false,
    }),
    [live.data, livePositions.data, guards.tradingEnabled, guards.circuitBreakerTripped],
  );

  const liveEquity = effPortfolio.totalEquity;
  const liveCash = effPortfolio.cashBalance;
  const liveDayPnl = effPortfolio.dailyPnl;
  const liveDayPnlPct = effPortfolio.dailyPnlPct;
  const buyingPower = live.data?.buyingPower ?? 0;
  const openCount = effPortfolio.positions.length;
  const deployedPct = liveEquity > 0 ? (1 - liveCash / liveEquity) * 100 : 0;
  const dayPos = liveDayPnl >= 0;
  const intraday = intradayFromAccount(live.data);

  const agentNote = live.loading && !live.data
    ? 'Rekeninggegevens laden…'
    : effPortfolio.positions.length === 0
      ? 'Paper-rekening — geen open posities. De bot handelt na de cron-routines.'
      : `Live: ${effPortfolio.positions.length} open positie(s). Stops en targets staan bij Alpaca.`;

  const doKill = () => {
    const next = !guards.tradingEnabled;
    setGuards(g => ({ ...g, tradingEnabled: next }));
    fetch('/api/guards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tradingEnabled: next }) }).catch(() => null);
    setConfirmKill(false);
    showToast(next ? 'Trading heractiveerd.' : 'Kill switch geactiveerd. Geen nieuwe orders.');
  };

  const doClose = async () => {
    const p = confirmClose!;
    setConfirmClose(null);
    setSelPos(null);
    try {
      const res = await fetch('/api/alpaca/positions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: p.symbol }) });
      if (res.status === 409) {
        livePositions.refresh?.();
        live.refresh?.();
        showToast(`${p.symbol} was al gesloten.`);
        return;
      }
      if (!res.ok) { showToast(`Fout bij sluiten van ${p.symbol}.`); return; }
      livePositions.refresh?.();
      live.refresh?.();
    } catch { showToast(`Verbindingsfout bij ${p.symbol}.`); return; }
    showToast(`${p.symbol} gesloten · ${fmt.signedUsd(p.unrealizedPnl)}.`);
  };

  return (
    <div className="m-app">
      <div className="m-hero" ref={heroRef}>
        <div className="m-hero-top">
          <div className="m-brand">
            <BrandLogo size={22} />
            <div style={{ minWidth: 0 }}>
              <div className="m-brand-name">Momentum</div>
              <div className="m-brand-sub">Paper · Alpaca</div>
            </div>
          </div>
          <div className="m-hero-actions">
            <button className={`m-hpill icon${equityOpen ? ' active' : ''}`} onClick={toggleEquity} aria-label="Equity tonen of verbergen">
              <Icon name="eye" size={15} />
            </button>
            <button className={`m-hpill icon${guards.tradingEnabled ? '' : ' tripped'}`} onClick={() => setConfirmKill(true)} aria-label="Kill switch">
              <Icon name={guards.tradingEnabled ? 'unlock' : 'lock'} size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="m-scroll" key={tab}>
        {tab === 'overview' && (
          <MobileOverview
            cash={liveCash} buyingPower={buyingPower} deployedPct={deployedPct} openCount={openCount}
            dayPnl={liveDayPnl} dayPnlPct={liveDayPnlPct} intraday={intraday}
            positions={effPortfolio.positions} agentNote={agentNote} marketOpen={live.data?.marketOpen ?? null}
            accountLoading={live.loading && !live.data}
            onOpenPosition={setSelPos} onGoPositions={() => setTab('more')}
          />
        )}
        {tab === 'activity' && <MobileActivity decisions={decisions} onOpenDecision={setSelDec} />}
        {tab === 'board' && <MobileBoard onCounts={setBoardTodo} />}
        {tab === 'more' && <MobileMore guards={guards} onToggleKill={() => setConfirmKill(true)} positions={effPortfolio.positions} onOpenPosition={setSelPos} />}
      </div>

      <nav className="m-tabbar" aria-label="Hoofdnavigatie">
        <div className="m-tabbar-inner">
          {TABS.map(t => (
            <button key={t.id} className={`m-tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
              <span className="m-tab-ico">
                <Icon name={t.icon} size={20} />
                {t.id === 'board' && boardTodo > 0 && <span className="m-tab-badge">{boardTodo}</span>}
              </span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <Sheet open={!!selPos} title={selPos?.symbol ?? ''} sub={selPos ? `${selPos.name}` : ''} onClose={() => setSelPos(null)}>
        {selPos && (
          <>
            {selPos.sparkline.length > 0 && <Sparkline values={selPos.sparkline} positive={selPos.unrealizedPnl >= 0} height={56} />}
            <div className="m-kpi-grid">
              <div className="m-kpi"><div className="k">Onger. P&amp;L</div><div className="v" style={{ color: selPos.unrealizedPnl >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{fmt.signedUsd(selPos.unrealizedPnl)}</div></div>
              <div className="m-kpi"><div className="k">Rendement</div><div className="v" style={{ color: selPos.unrealizedPnl >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{fmt.pct(selPos.unrealizedPnlPct)}</div></div>
            </div>
            <div>
              <div className="m-kv"><span className="k">Aantal</span><span className="v">{selPos.qty} st</span></div>
              <div className="m-kv"><span className="k">Entry</span><span className="v">{fmt.usd(selPos.avgEntryPrice)}</span></div>
              <div className="m-kv"><span className="k">Mark</span><span className="v">{fmt.usd(selPos.currentPrice)}</span></div>
              <div className="m-kv"><span className="k">Marktwaarde</span><span className="v">{fmt.usd(selPos.marketValue)}</span></div>
            </div>
            <button className="m-btn danger" onClick={() => setConfirmClose(selPos)}><Icon name="x" size={14} /> Positie sluiten</button>
          </>
        )}
      </Sheet>

      <Sheet open={!!selDec} title={selDec ? `${selDec.symbol} · ${selDec.decision.replace('_', '-')}` : ''} sub={selDec ? `${selDec.routine} · ${fmt.time(selDec.ts)} ET` : ''} onClose={() => setSelDec(null)}>
        {selDec && (
          <>
            <div className="m-card" style={{ background: 'var(--bg-app)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span className={`m-badge ${badgeClass(selDec.decision)}`}>{selDec.decision.replace('_', '-')}</span>
                <Icon name="bolt" size={12} className="text-accent" />
              </div>
              <div className="m-prose" style={{ color: 'var(--text-primary)' }}>{selDec.agentNote || selDec.rationale}</div>
            </div>
            {selDec.criteria && (
              <div>
                <div className="m-card-title" style={{ marginBottom: 8 }}>Entry-criteria</div>
                <div className="m-criteria">
                  {Object.entries(selDec.criteria).map(([k, v]) => (
                    <div key={k} className={`m-crit-row ${v === 'pass' ? 'pass' : 'fail'}`}>
                      <span className="label">{k}</span>
                      <span className="state" style={{ color: v === 'pass' ? 'var(--pos)' : 'var(--neg)' }}>{v.toUpperCase()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {selDec.orderId && <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Order ID: <span style={{ fontFamily: 'var(--font-mono)' }}>{selDec.orderId}</span></div>}
          </>
        )}
      </Sheet>

      <Sheet open={!!confirmClose} title={`${confirmClose?.symbol} sluiten?`} sub="Marktorder · overruled de strategie-exit" onClose={() => setConfirmClose(null)}>
        {confirmClose && (
          <>
            <div className="m-kpi-grid">
              <div className="m-kpi"><div className="k">Aantal</div><div className="v">{confirmClose.qty} st</div></div>
              <div className="m-kpi"><div className="k">Mark</div><div className="v">{fmt.usd(confirmClose.currentPrice)}</div></div>
              <div className="m-kpi"><div className="k">Onger. P&amp;L</div><div className="v" style={{ color: confirmClose.unrealizedPnl >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{fmt.signedUsd(confirmClose.unrealizedPnl)}</div></div>
              <div className="m-kpi"><div className="k">Rendement</div><div className="v" style={{ color: confirmClose.unrealizedPnl >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{fmt.pct(confirmClose.unrealizedPnlPct)}</div></div>
            </div>
            <button className="m-btn danger" onClick={doClose}>Positie sluiten</button>
            <button className="m-btn ghost" onClick={() => setConfirmClose(null)}>Annuleren</button>
          </>
        )}
      </Sheet>

      <Sheet open={confirmKill} title={guards.tradingEnabled ? 'Trading stoppen?' : 'Trading inschakelen?'} sub="Kill switch" onClose={() => setConfirmKill(false)}>
        <div className="m-prose" style={{ color: 'var(--text-secondary)' }}>
          {guards.tradingEnabled
            ? 'Dit stopt alle orderverzending direct. Bestaande posities worden nog beheerd; stops blijven actief.'
            : 'Trading wordt geactiveerd. De agent kan weer orders inleggen na het doorlopen van de guards.'}
        </div>
        <button className={`m-btn ${guards.tradingEnabled ? 'danger' : 'success'}`} onClick={doKill}>
          <Icon name={guards.tradingEnabled ? 'lock' : 'unlock'} size={15} /> {guards.tradingEnabled ? 'Trading stoppen' : 'Trading inschakelen'}
        </button>
        <button className="m-btn ghost" onClick={() => setConfirmKill(false)}>Annuleren</button>
      </Sheet>

      {equityOpen && createPortal(
        <div className="m-topdrawer-backdrop" style={{ top: drawerTop }} onClick={() => setEquityOpen(false)}>
          <div className="m-topdrawer" onClick={e => e.stopPropagation()}>
            <div className="m-topdrawer-label">Equity</div>
            <div className="m-topdrawer-val">{fmt.usd(liveEquity)}</div>
            <div className="m-topdrawer-pnl">
              <span className={dayPos ? 'pos' : 'neg'}>{fmt.signedUsd(liveDayPnl)}</span>
              <span className={dayPos ? 'pos' : 'neg'}>{fmt.pct(liveDayPnlPct)}</span>
              <span className="lbl">vandaag</span>
            </div>
          </div>
        </div>,
        document.body
      )}

      {toast && createPortal(
        <div className="m-toast">
          <Icon name="bolt" size={13} className="text-accent" /> <span>{toast}</span>
        </div>,
        document.body
      )}
    </div>
  );
}
