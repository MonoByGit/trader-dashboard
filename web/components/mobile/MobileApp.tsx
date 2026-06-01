'use client';

import './mobile.css';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon, BrandLogo } from '@/components/ui/Icon';
import { fmt } from '@/lib/format';
import { MOCK, type Portfolio, type Position } from '@/lib/mock';
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

export function MobileApp() {
  const [tab, setTab] = useState<TabId>(() => {
    try { return (localStorage.getItem('trader-m-tab') as TabId) || 'overview'; } catch { return 'overview'; }
  });
  const live = useAccount(30000);
  const livePositions = usePositions(15000);
  const [portfolio, setPortfolio] = useState<Portfolio>(MOCK.portfolioActive as Portfolio);
  const [guards, setGuards] = useState(MOCK.guards);
  const [decisions, setDecisions] = useState<MDecision[]>(MOCK.decisions as MDecision[]);
  const [selPos, setSelPos] = useState<Position | null>(null);
  const [selDec, setSelDec] = useState<MDecision | null>(null);
  const [confirmClose, setConfirmClose] = useState<Position | null>(null);
  const [confirmKill, setConfirmKill] = useState(false);
  const [equityOpen, setEquityOpen] = useState(false);
  const [drawerTop, setDrawerTop] = useState(0);
  const heroRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Aantal draden waar Dusty aan zet is (badge op de Samen-tab).
  const [boardTodo, setBoardTodo] = useState(0);
  // Demo (dummy) data aan/uit. Aan = de rijke voorbeelddata; uit = de echte
  // (mogelijk lege) Alpaca-rekening. Default demo aan zolang de bot nog niet
  // live handelt, zodat het dashboard gevuld oogt.
  const [dummy, setDummy] = useState(() => { try { return localStorage.getItem('trader-m-dummy') !== '0'; } catch { return true; } });

  useEffect(() => { try { localStorage.setItem('trader-m-tab', tab); } catch {} }, [tab]);
  const toggleDummy = () => setDummy(d => { const n = !d; try { localStorage.setItem('trader-m-dummy', n ? '1' : '0'); } catch {} if (!n) live.refresh?.(); showToast(n ? 'Demo-data aan.' : 'Live Alpaca-data aan.'); return n; });
  // Open/sluit de equity-drawer; meet de header-onderkant zodat de drawer daar
  // precies onder begint te zakken (safe-area-proof, geen vaste hoogte aanname).
  const toggleEquity = () => setEquityOpen(o => { if (!o && heroRef.current) setDrawerTop(Math.round(heroRef.current.getBoundingClientRect().bottom)); return !o; });

  // Kill switch state + decisions uit backend (val terug op mock).
  useEffect(() => {
    fetch('/api/guards').then(r => r.json()).then(d => setGuards(g => ({ ...g, tradingEnabled: d.tradingEnabled }))).catch(() => null);
    fetch('/api/decisions').then(r => r.json()).then(d => { if (Array.isArray(d) && d.length) setDecisions(d); }).catch(() => null);
  }, []);

  // Badge op de Samen-tab: hoeveel draden staan bij Dusty (turn=jij).
  useEffect(() => {
    const poll = () => fetch('/api/threads').then(r => r.json()).then(d => setBoardTodo(d?.counts?.todo ?? 0)).catch(() => null);
    poll();
    const iv = setInterval(poll, 30000);
    return () => clearInterval(iv);
  }, [tab]);

  // Lichte prijsdrift zodat cijfers leven (alleen in demo-modus).
  useEffect(() => {
    if (!dummy) return;
    const interval = setInterval(() => {
      setPortfolio(p => {
        const positions = p.positions.map(pos => {
          const drift = (Math.random() - 0.48) * 0.12;
          const newPrice = +(pos.currentPrice + drift).toFixed(2);
          const newHigh = Math.max(pos.highWatermark, newPrice);
          return { ...pos, currentPrice: newPrice, highWatermark: newHigh, trailingStop: +(newHigh * 0.97).toFixed(2), marketValue: +(newPrice * pos.qty).toFixed(2), unrealizedPnl: +((newPrice - pos.avgEntryPrice) * pos.qty).toFixed(2), unrealizedPnlPct: +((newPrice - pos.avgEntryPrice) / pos.avgEntryPrice * 100).toFixed(2) };
        });
        const totalEquity = +(p.cashBalance + positions.reduce((s, x) => s + x.marketValue, 0)).toFixed(2);
        return { ...p, positions, totalEquity, dailyPnl: +(totalEquity - p.dayStartEquity).toFixed(2), dailyPnlPct: +((totalEquity - p.dayStartEquity) / p.dayStartEquity * 100).toFixed(3) };
      });
    }, 3500);
    return () => clearInterval(interval);
  }, [dummy]);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3200); };

  // Effectieve portfolio: demo = mock; live = echte Alpaca-rekening + posities.
  const livePos: Position[] = livePositions.data.map(p => ({
    symbol: p.symbol, name: p.symbol, sector: '—', qty: p.qty,
    avgEntryPrice: p.avgEntryPrice, currentPrice: p.currentPrice, highWatermark: p.currentPrice,
    entryAt: '', stopLoss: 0, trailingStop: 0, takeProfit: 0, sma20: 0,
    marketValue: p.marketValue, costBasis: p.costBasis,
    unrealizedPnl: p.unrealizedPnl, unrealizedPnlPct: p.unrealizedPnlPct, sparkline: [],
  } as Position));
  const effPortfolio: Portfolio = dummy ? portfolio : ({
    totalEquity: live.data?.equity ?? 0,
    cashBalance: live.data?.cash ?? 0,
    dayStartEquity: live.data ? live.data.equity - live.data.dayPnl : 0,
    dailyPnl: live.data?.dayPnl ?? 0,
    dailyPnlPct: (live.data?.dayPnlPct ?? 0) * 100,
    allTimePnl: 0, allTimePnlPct: 0,
    tradingEnabled: guards.tradingEnabled, circuitBreakerTripped: false,
    positions: livePos,
  } as Portfolio);

  const liveEquity = effPortfolio.totalEquity;
  const liveCash = effPortfolio.cashBalance;
  const liveDayPnl = effPortfolio.dailyPnl;
  const liveDayPnlPct = effPortfolio.dailyPnlPct;
  const buyingPower = dummy ? portfolio.totalEquity * 1.95 : (live.data?.buyingPower ?? 0);
  const openCount = effPortfolio.positions.length;
  const deployedPct = liveEquity > 0 ? (1 - liveCash / liveEquity) * 100 : 0;
  const dayPos = liveDayPnl >= 0;
  const activeDecisions = dummy ? (MOCK.decisions as MDecision[]) : decisions;

  const agentNote = !dummy
    ? (effPortfolio.positions.length === 0 ? 'Live Alpaca-rekening — geen open posities. De bot heeft nog niet gehandeld.' : 'Live posities van je Alpaca-rekening.')
    : (effPortfolio.positions.length === 0
        ? 'Alle posities gesloten. Geen nieuwe entries vandaag, EOD draait zo.'
        : 'Ik monitor QQQ en XLK. Trailing stops ademen met de hoogtepunten. Volgende volledige check: midday.');

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
      if (!res.ok) { showToast(`Fout bij sluiten van ${p.symbol}.`); return; }
    } catch { showToast(`Verbindingsfout bij ${p.symbol}.`); return; }
    setPortfolio(prev => ({ ...prev, positions: prev.positions.filter(x => x.symbol !== p.symbol), cashBalance: +(prev.cashBalance + p.marketValue).toFixed(2) }));
    showToast(`${p.symbol} gesloten · ${fmt.signedUsd(p.unrealizedPnl)}.`);
  };

  return (
    <div className="m-app">
      {/* Header — vaste hoogte, alleen icoon-pillen */}
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

      {/* Content */}
      <div className="m-scroll" key={tab}>
        {tab === 'overview' && (
          <MobileOverview
            cash={liveCash} buyingPower={buyingPower} deployedPct={deployedPct} openCount={openCount}
            dayPnl={liveDayPnl} dayPnlPct={liveDayPnlPct} intraday={dummy ? MOCK.equityIntraday.map(p => p.v) : []}
            positions={effPortfolio.positions} agentNote={agentNote} marketOpen={live.data?.marketOpen ?? null}
            onOpenPosition={setSelPos} onGoPositions={() => setTab('more')}
          />
        )}
        {tab === 'activity' && <MobileActivity decisions={activeDecisions} onOpenDecision={setSelDec} />}
        {tab === 'board' && <MobileBoard onCounts={setBoardTodo} />}
        {tab === 'more' && <MobileMore guards={guards} onToggleKill={() => setConfirmKill(true)} dummy={dummy} onToggleDummy={toggleDummy} positions={effPortfolio.positions} onOpenPosition={setSelPos} />}
      </div>

      {/* Bottom tab bar */}
      <nav className="m-tabbar">
        {TABS.map(t => (
          <button key={t.id} className={`m-tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
            <span className="m-tab-ico">
              <Icon name={t.icon} size={20} />
              {t.id === 'board' && boardTodo > 0 && <span className="m-tab-badge">{boardTodo}</span>}
            </span>
            {t.label}
          </button>
        ))}
      </nav>

      {/* Position detail */}
      <Sheet open={!!selPos} title={selPos?.symbol ?? ''} sub={selPos ? `${selPos.name} · ${selPos.sector}` : ''} onClose={() => setSelPos(null)}>
        {selPos && (
          <>
            <Sparkline values={selPos.sparkline} positive={selPos.unrealizedPnl >= 0} height={56} />
            <div className="m-kpi-grid">
              <div className="m-kpi"><div className="k">Onger. P&amp;L</div><div className="v" style={{ color: selPos.unrealizedPnl >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{fmt.signedUsd(selPos.unrealizedPnl)}</div></div>
              <div className="m-kpi"><div className="k">Rendement</div><div className="v" style={{ color: selPos.unrealizedPnl >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{fmt.pct(selPos.unrealizedPnlPct)}</div></div>
            </div>
            <div>
              <div className="m-kv"><span className="k">Aantal</span><span className="v">{selPos.qty} st</span></div>
              <div className="m-kv"><span className="k">Entry</span><span className="v">{fmt.usd(selPos.avgEntryPrice)}</span></div>
              <div className="m-kv"><span className="k">Mark</span><span className="v">{fmt.usd(selPos.currentPrice)}</span></div>
              <div className="m-kv"><span className="k">Harde stop</span><span className="v">{fmt.usd(selPos.stopLoss)}</span></div>
              <div className="m-kv"><span className="k">Trailing stop</span><span className="v">{fmt.usd(selPos.trailingStop)}</span></div>
              <div className="m-kv"><span className="k">Take profit</span><span className="v">{fmt.usd(selPos.takeProfit)}</span></div>
              <div className="m-kv"><span className="k">SMA20</span><span className="v">{fmt.usd(selPos.sma20)}</span></div>
              <div className="m-kv"><span className="k">Marktwaarde</span><span className="v">{fmt.usd(selPos.marketValue)}</span></div>
            </div>
            <button className="m-btn danger" onClick={() => setConfirmClose(selPos)}><Icon name="x" size={14} /> Positie sluiten</button>
          </>
        )}
      </Sheet>

      {/* Decision detail */}
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
            {selDec.gates && (
              <div>
                <div className="m-card-title" style={{ marginBottom: 8 }}>Markt-gates</div>
                <div className="m-criteria">
                  {Object.entries(selDec.gates).map(([k, v]) => (
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

      {/* Close confirm */}
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

      {/* Kill confirm */}
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

      {/* Equity-drawer — zakt vanaf onder de header naar beneden */}
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

      {/* Toast — bovenin */}
      {toast && createPortal(
        <div className="m-toast">
          <Icon name="bolt" size={13} className="text-accent" /> <span>{toast}</span>
        </div>,
        document.body
      )}
    </div>
  );
}
