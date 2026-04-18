'use client';

import { useState, useEffect } from 'react';
import { Icon, BrandLogo } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { Toggle } from '@/components/ui/Toggle';
import { Segmented } from '@/components/ui/Segmented';
import { Modal } from '@/components/ui/Modal';
import { fmt } from '@/lib/format';
import { MOCK } from '@/lib/mock';
import { useAccount, usePositions } from '@/hooks/useAlpaca';
import { useUnread } from '@/hooks/useUnread';
import { OverviewPage } from '@/components/pages/OverviewPage';
import { PositionsPage } from '@/components/pages/PositionsPage';
import { DecisionLogPage } from '@/components/pages/DecisionLogPage';
import { ConversationsPage } from '@/components/pages/ConversationsPage';
import { RoutinesPage } from '@/components/pages/RoutinesPage';
import { RiskPage } from '@/components/pages/RiskPage';
import { StrategyPage } from '@/components/pages/StrategyPage';
import { LessonsPage } from '@/components/pages/LessonsPage';
import { ReportsPage } from '@/components/pages/ReportsPage';
import { HistoryPage } from '@/components/pages/HistoryPage';

const PAGES = [
  { id: 'overview', label: 'Overview', icon: 'dashboard' },
  { id: 'positions', label: 'Positions', icon: 'positions' },
  { id: 'decisions', label: 'Decision Log', icon: 'log' },
  { id: 'conversations', label: 'Conversations', icon: 'chat' },
  { id: 'routines', label: 'Routines', icon: 'routines' },
  { id: 'risk', label: 'Risk & Guards', icon: 'shield' },
  { id: 'strategy', label: 'Strategy', icon: 'strategy' },
  { id: 'lessons', label: 'Lessons', icon: 'sparkle' },
  { id: 'reports', label: 'Reports', icon: 'logs' },
  { id: 'history', label: 'History', icon: 'history' },
] as const;

const LAYERS = [
  { id: 'sym-QQQ', label: 'QQQ · Open Position', dot: 'var(--pos)', section: 'Positions' },
  { id: 'sym-XLK', label: 'XLK · Open Position', dot: 'var(--pos)', section: 'Positions' },
  { id: 'sym-SPY', label: 'SPY · Watchlist', dot: 'var(--text-tertiary)', section: 'Watchlist' },
  { id: 'sym-IWM', label: 'IWM · Watchlist', dot: 'var(--text-tertiary)', section: 'Watchlist' },
  { id: 'sym-XLE', label: 'XLE · NO_GO', dot: 'var(--neg)', section: 'Watchlist' },
];

type PageId = typeof PAGES[number]['id'];
type Decision = { id: string; symbol: string; decision: string; ts: string; agentNote?: string; rationale: string; criteria?: Record<string, string>; routine: string; orderId?: string; };
type Position = { symbol: string; name: string; sector: string; qty: number; avgEntryPrice: number; currentPrice: number; highWatermark: number; entryAt: string; stopLoss: number; trailingStop: number; takeProfit: number; sma20: number; marketValue: number; costBasis: number; unrealizedPnl: number; unrealizedPnlPct: number; };
type Routine = { id: string; name: string; time: string; lastRun: string; summary: string; status: string; nextRun: string; };
type Guards = { tradingEnabled: boolean; circuitBreakerTripped: boolean; circuitBreakerReason?: string; dailyDrawdownPct: number; peakDrawdownPct: number; dailyDrawdownLimit: number; peakDrawdownLimit: number; consecLosses: number; consecLossesLimit: number; tradesLast10Min: number; tradesLast10MinLimit: number; openPositions: number; maxOpenPositions: number; dailyTrades: number; maxDailyTrades: number; cashReservePct: number; cashReserveMin: number; maxOrderSize: number; minOrderSize: number; };
type Portfolio = { totalEquity: number; cashBalance: number; dayStartEquity: number; dailyPnl: number; dailyPnlPct: number; tradingEnabled: boolean; circuitBreakerTripped: boolean; positions: Position[]; };

const TWEAK_DEFAULTS = { theme: 'dark', mode: 'active', density: 'comfortable', agentPersona: true, accent: '#0d99ff' };

export function DashboardShell() {
  const [tweaks, setTweaks] = useState<typeof TWEAK_DEFAULTS>(() => {
    try {
      if (typeof window === 'undefined') return TWEAK_DEFAULTS;
      const saved = localStorage.getItem('trader-tweaks');
      return saved ? { ...TWEAK_DEFAULTS, ...JSON.parse(saved) } : TWEAK_DEFAULTS;
    } catch { return TWEAK_DEFAULTS; }
  });
  const [page, setPage] = useState<PageId>(() => {
    try { if (typeof window === 'undefined') return 'overview'; return (localStorage.getItem('trader-page') || 'overview') as PageId; } catch { return 'overview'; }
  });
  const [showTweaks, setShowTweaks] = useState(false);
  const [selectedDecision, setSelectedDecision] = useState<Decision | null>(null);
  const [confirmClose, setConfirmClose] = useState<Position | null>(null);
  const [confirmKill, setConfirmKill] = useState(false);
  const [confirmRoutine, setConfirmRoutine] = useState<Routine | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [leftOpen, setLeftOpen] = useState(() => { try { return localStorage.getItem('trader-left') !== 'false'; } catch { return true; } });
  const [rightOpen, setRightOpen] = useState(() => { try { return localStorage.getItem('trader-right') !== 'false'; } catch { return true; } });
  const live = useAccount(30000);
  const livePositions = usePositions(15000);
  const unread = useUnread(90000);
  const [guards, setGuards] = useState<Guards>(MOCK.guards as Guards);
  const [portfolio, setPortfolio] = useState<Portfolio>(() => tweaks.mode === 'active' ? MOCK.portfolioActive as Portfolio : MOCK.portfolioEmpty as Portfolio);
  const [liveTick, setLiveTick] = useState(false);

  useEffect(() => {
    try { localStorage.setItem('trader-page', page); } catch {}
    if (page === 'decisions') unread.markSeen('decisions');
    if (page === 'conversations') unread.markSeen('conversations');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);
  useEffect(() => { try { localStorage.setItem('trader-left', String(leftOpen)); } catch {} }, [leftOpen]);
  useEffect(() => { try { localStorage.setItem('trader-right', String(rightOpen)); } catch {} }, [rightOpen]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === '[') { e.preventDefault(); setLeftOpen(v => !v); }
      if (e.metaKey && e.key === ']') { e.preventDefault(); setRightOpen(v => !v); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  useEffect(() => {
    try { localStorage.setItem('trader-tweaks', JSON.stringify(tweaks)); } catch {}
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', tweaks.theme);
      document.documentElement.setAttribute('data-density', tweaks.density);
      document.documentElement.style.setProperty('--accent', tweaks.accent);
    }
  }, [tweaks]);
  useEffect(() => { setPortfolio(tweaks.mode === 'active' ? MOCK.portfolioActive as Portfolio : MOCK.portfolioEmpty as Portfolio); }, [tweaks.mode]);

  // Load kill switch state from backend on mount
  useEffect(() => {
    fetch('/api/guards').then(r => r.json()).then(d => {
      setGuards(g => ({ ...g, tradingEnabled: d.tradingEnabled }));
    }).catch(() => null);
  }, []);

  useEffect(() => {
    if (tweaks.mode !== 'active') return;
    const interval = setInterval(() => {
      setPortfolio(p => {
        const updated = {
          ...p,
          positions: p.positions.map(pos => {
            const drift = (Math.random() - 0.48) * 0.12;
            const newPrice = +(pos.currentPrice + drift).toFixed(2);
            const newHigh = Math.max(pos.highWatermark, newPrice);
            const unrealizedPnl = +((newPrice - pos.avgEntryPrice) * pos.qty).toFixed(2);
            const unrealizedPnlPct = +((newPrice - pos.avgEntryPrice) / pos.avgEntryPrice * 100).toFixed(2);
            return { ...pos, currentPrice: newPrice, highWatermark: newHigh, trailingStop: +(newHigh * 0.97).toFixed(2), marketValue: +(newPrice * pos.qty).toFixed(2), unrealizedPnl, unrealizedPnlPct };
          })
        };
        const newEquity = updated.cashBalance + updated.positions.reduce((s, x) => s + x.marketValue, 0);
        updated.totalEquity = +newEquity.toFixed(2);
        updated.dailyPnl = +(updated.totalEquity - updated.dayStartEquity).toFixed(2);
        updated.dailyPnlPct = +((updated.dailyPnl / updated.dayStartEquity) * 100).toFixed(3);
        return updated;
      });
      setLiveTick(true);
      setTimeout(() => setLiveTick(false), 400);
    }, 3500);
    return () => clearInterval(interval);
  }, [tweaks.mode]);

  const updateTweak = (k: keyof typeof TWEAK_DEFAULTS, v: string | boolean) => setTweaks(t => ({ ...t, [k]: v }));

  const showToastMsg = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3400); };

  const handleClosePosition = (p: Position) => setConfirmClose(p);
  const doClose = async () => {
    const p = confirmClose!;
    try {
      const res = await fetch('/api/alpaca/positions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: p.symbol }),
      });
      if (!res.ok) {
        const err = await res.json();
        showToastMsg(`Fout bij sluiten: ${err.error ?? res.status}`);
        setConfirmClose(null);
        return;
      }
    } catch {
      showToastMsg(`Verbindingsfout bij sluiten van ${p.symbol}.`);
      setConfirmClose(null);
      return;
    }
    setPortfolio(prev => ({
      ...prev,
      positions: prev.positions.filter(x => x.symbol !== p.symbol),
      cashBalance: +(prev.cashBalance + p.marketValue).toFixed(2)
    }));
    setConfirmClose(null);
    showToastMsg(`${p.symbol} gesloten op ${fmt.usd(p.currentPrice)} · ${fmt.signedUsd(p.unrealizedPnl)}.`);
  };

  const doKillSwitch = () => {
    const next = !guards.tradingEnabled;
    setGuards(g => ({ ...g, tradingEnabled: next }));
    fetch('/api/guards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tradingEnabled: next }),
    }).catch(() => null);
    showToastMsg(next ? 'Trading heractiveerd.' : 'Kill switch geactiveerd. Geen nieuwe orders meer.');
    setConfirmKill(false);
  };

  const handleKickoffSelect = async (opt: { symbol: string; thesis: string; rationale: string; confidence: number; entryZone: string; stopLevel: string }) => {
    const threadId = `kickoff-${Date.now()}`;
    const threadTitle = `Sessie: ${opt.symbol} — ${opt.thesis.slice(0, 60)}`;
    const message = `Ik heb ${opt.symbol} gekozen als focus voor vandaag. Thesis: ${opt.thesis}\n\nRationale: ${opt.rationale}\n\nEntry zone: ${opt.entryZone} · Stop: ${opt.stopLevel}\n\nBevestig mijn keuze en geef me een concreet plan: wat watch je, wanneer ga je in, wanneer stap je uit?`;
    fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId, threadTitle, message }),
    }).catch(() => null);
    setPage('conversations');
    showToastMsg(`Sessie gestart: ${opt.symbol}. Conversations geopend.`);
  };

  const doTriggerRoutine = async () => {
    const r = confirmRoutine!;
    setConfirmRoutine(null);
    showToastMsg(`Routine "${r.name}" wordt uitgevoerd…`);
    try {
      const res = await fetch('/api/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routine: r.id }),
      });
      const data = await res.json();
      showToastMsg(res.ok ? `"${r.name}" voltooid.` : `Fout: ${data.error ?? res.status}`);
    } catch {
      showToastMsg(`Verbindingsfout bij "${r.name}".`);
    }
  };

  const liveEquity = live.data?.equity ?? portfolio.totalEquity;
  const liveCash = live.data?.cash ?? portfolio.cashBalance;
  const liveDayPnl = live.data?.dayPnl ?? portfolio.dailyPnl;
  const liveDayPnlPct = live.data?.dayPnlPct ?? portfolio.dailyPnlPct;
  const livePositionCount = livePositions.data.length > 0 ? livePositions.data.length : portfolio.positions.length;
  const dayPos = liveDayPnl >= 0;

  const currentPage = (() => {
    switch (page) {
      case 'overview': return <OverviewPage portfolio={portfolio} mode={tweaks.mode} tweaks={tweaks} onOpenDecision={setSelectedDecision} onTriggerRoutine={r => setConfirmRoutine(r as Routine)} onClosePosition={handleClosePosition} onOpenKillSwitch={() => setConfirmKill(true)} onKickoffSelect={handleKickoffSelect} liveTick={liveTick}/>;
      case 'positions': return <PositionsPage portfolio={portfolio} mode={tweaks.mode} onClose={handleClosePosition}/>;
      case 'decisions': return <DecisionLogPage mode={tweaks.mode} onOpenDecision={setSelectedDecision}/>;
      case 'conversations': return <ConversationsPage/>;
      case 'routines': return <RoutinesPage onTrigger={r => setConfirmRoutine(r as Routine)}/>;
      case 'risk': return <RiskPage guards={guards} onOpenKill={() => setConfirmKill(true)} onResetBreaker={() => showToastMsg('Geen breaker getript. Reset niet nodig.')}/>;
      case 'strategy': return <StrategyPage/>;
      case 'lessons': return <LessonsPage/>;
      case 'reports': return <ReportsPage/>;
      case 'history': return <HistoryPage/>;
      default: return null;
    }
  })();

  return (
    <div className="app">
      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-left">
          <div className="logo"><BrandLogo size={20}/></div>
          <button className={`icon-btn panel-toggle${leftOpen ? ' active' : ''}`} title="Toggle left panel (⌘[)" aria-label="Toggle left panel" onClick={() => setLeftOpen(v => !v)}>
            <Icon name="sidebarLeft" size={14}/>
          </button>
          <div className="file-name">
            <Icon name="chev" size={10}/>
            <span className="text-secondary">Trader Agent</span>
            <span className="sep">/</span>
            <span className="doc">Paper Trading · Dashboard v0.1</span>
          </div>
        </div>
        <div className="toolbar-center">
          <div className="page-tabs">
            {PAGES.map(p => (
              <button key={p.id} className={`page-tab${page === p.id ? ' active' : ''}`} onClick={() => setPage(p.id)}>
                <Icon name={p.icon as Parameters<typeof Icon>[0]['name']} size={11}/>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="toolbar-right">
          <button
            className={`btn outline${tweaks.mode === 'active' ? ' active' : ''}`}
            style={{fontSize:10,padding:'3px 8px',height:24,opacity: tweaks.mode === 'active' ? 1 : 0.5}}
            title="Toggle demo data on/off"
            onClick={() => updateTweak('mode', tweaks.mode === 'active' ? 'empty' : 'active')}
          >DEMO</button>
          <button className={`icon-btn panel-toggle${rightOpen ? ' active' : ''}`} title="Toggle right panel (⌘])" aria-label="Toggle right panel" onClick={() => setRightOpen(v => !v)}>
            <Icon name="sidebarRight" size={14}/>
          </button>
          <div style={{width:1,height:20,background:'var(--border-subtle)',margin:'0 2px'}}/>
          <button className={`icon-btn${guards.tradingEnabled ? '' : ' active'}`} title="Kill switch" aria-label="Kill switch" onClick={() => setConfirmKill(true)}>
            <Icon name={guards.tradingEnabled ? 'unlock' : 'lock'} size={14}/>
          </button>
          <button className="icon-btn" title="Notifications" aria-label="Notifications"><Icon name="bell" size={14}/></button>
          <button className={`icon-btn${showTweaks ? ' active' : ''}`} title="Tweaks" aria-label="Tweaks" onClick={() => setShowTweaks(s => !s)}><Icon name="tweak" size={14}/></button>
          <div style={{width:1,height:20,background:'var(--border-subtle)',margin:'0 4px'}}/>
          <div style={{width:26,height:26,borderRadius:'50%',background:'var(--bg-input)',border:'1px solid var(--border-strong)',color:'var(--text-secondary)',display:'grid',placeItems:'center'}}><Icon name="user" size={13}/></div>
        </div>
      </div>

      {/* Main */}
      <div className={`main${leftOpen ? '' : ' left-closed'}${rightOpen ? '' : ' right-closed'}`}>
        {/* Left panel */}
        <div className="left-panel">
          <div className="panel-section">
            <div className="panel-header">Pages <span className="count">{PAGES.length}</span></div>
            {PAGES.map(p => (
              <div key={p.id} className={`nav-row${page === p.id ? ' active' : ''}`} onClick={() => setPage(p.id)}>
                <div className="nav-icon"><Icon name={p.icon as Parameters<typeof Icon>[0]['name']} size={13}/></div>
                <span>{p.label}</span>
                {p.id === 'decisions' && unread.decisions > 0 && <span className="nav-badge unread">{unread.decisions}</span>}
                {p.id === 'conversations' && unread.conversations > 0 && <span className="nav-badge unread">{unread.conversations}</span>}
                {p.id === 'positions' && <span className="nav-badge">{livePositionCount}/3</span>}
              </div>
            ))}
          </div>

          <div className="panel-section">
            <div className="panel-header">Symbols <span className="count">{LAYERS.length}</span></div>
            {LAYERS.map(l => (
              <div key={l.id} className="layer-row">
                <div className="caret"><Icon name="chevR" size={9}/></div>
                <div className="dot" style={{background:l.dot}}/>
                <span>{l.label}</span>
              </div>
            ))}
          </div>

          <div className="panel-section">
            <div className="panel-header">System</div>
            <div className="nav-row" style={{paddingLeft:24}}>
              <div className="nav-icon"><Icon name="terminal" size={13}/></div><span>Logs</span>
            </div>
            <div className="nav-row" style={{paddingLeft:24}}>
              <div className="nav-icon"><Icon name="settings" size={13}/></div><span>Environment</span>
            </div>
          </div>

          <div style={{flex:1}}/>
          <div style={{padding:12,borderTop:'1px solid var(--border-subtle)'}}>
            <div style={{fontSize:10,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:0.05,marginBottom:6}}>Agent</div>
            <div style={{display:'flex',alignItems:'center',gap:8,padding:8,background:'var(--bg-app)',borderRadius:6}}>
              <div style={{width:28,height:28,borderRadius:6,background:'var(--bg-input)',border:'1px solid var(--border-strong)',display:'grid',placeItems:'center',color:'var(--text-secondary)'}}><BrandLogo size={16}/></div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11,fontWeight:500}}>Momentum-1</div>
                <div style={{fontSize:10,color:'var(--text-tertiary)'}}>claude-sonnet · paper</div>
              </div>
              <Pill kind="pos" dot pulse/>
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="canvas">
          <div className="canvas-inner" key={page}>
            {currentPage}
          </div>
        </div>

        {/* Right panel / Inspector */}
        <div className="right-panel">
          <div className="prop-group">
            <div className="prop-group-title">
              Portfolio{' '}
              <Pill kind={dayPos?'pos':'neg'}>{fmt.pct(liveDayPnlPct)}</Pill>
              {live.data && <span style={{fontSize:9,color:'var(--text-tertiary)',marginLeft:4}}>LIVE</span>}
            </div>
            <div className="prop-row"><span className="k">Equity</span><span className="v">{fmt.usd(liveEquity)}</span></div>
            <div className="prop-row"><span className="k">Cash</span><span className="v">{fmt.usd(liveCash)}</span></div>
            <div className="prop-row"><span className="k">Day P&amp;L</span><span className="v" style={{color:dayPos?'var(--pos)':'var(--neg)'}}>{fmt.signedUsd(liveDayPnl)}</span></div>
            <div className="prop-row"><span className="k">Deployed</span><span className="v">{((1 - liveCash/liveEquity)*100).toFixed(1)}%</span></div>
            <div className="prop-row"><span className="k">Open</span><span className="v">{livePositionCount} / 3</span></div>
          </div>

          <div className="prop-group">
            <div className="prop-group-title">Market Gates</div>
            <GateRow label="VIX" v="18.4" ok lim="< 30"/>
            <GateRow label="Earnings day" v="No" ok/>
            <GateRow label="Open buffer" v="09:30-09:35" ok msg="Past"/>
            <GateRow label="Pre-close" v="15:40-16:00" ok msg="Clear"/>
            <GateRow label="Half-day" v="No" ok/>
          </div>

          <div className="prop-group">
            <div className="prop-group-title">Risk Guards</div>
            <div className="prop-row"><span className="k">Kill switch</span><span className="v full">{guards.tradingEnabled?<Pill kind="pos" dot pulse>ENABLED</Pill>:<Pill kind="neg" dot>DISABLED</Pill>}</span></div>
            <div className="prop-row"><span className="k">Breaker</span><span className="v full">{guards.circuitBreakerTripped?<Pill kind="neg" dot>TRIPPED</Pill>:<Pill kind="muted">Standby</Pill>}</span></div>
            <div className="prop-row"><span className="k">Day DD</span><span className="v">{guards.dailyDrawdownPct.toFixed(2)}%</span></div>
            <div className="prop-row"><span className="k">Consec L</span><span className="v">{guards.consecLosses} / {guards.consecLossesLimit}</span></div>
          </div>

          <div className="prop-group">
            <div className="prop-group-title">Agent <Pill kind="accent" dot pulse>THINKING</Pill></div>
            <div style={{fontSize:11,color:'var(--text-secondary)',lineHeight:1.5}}>
              {tweaks.mode === 'empty'
                ? 'Premarket is klaar. Ik wacht op 09:35 om de 10 symbolen af te gaan.'
                : portfolio.positions.length === 0
                  ? 'Alle posities gesloten. Geen nieuwe entries vandaag, EOD draait zo.'
                  : 'Ik monitor QQQ en XLK. Trailing stops ademen met de hoogtepunten. Volgende volledige check: midday.'}
            </div>
            <div style={{marginTop:10,display:'flex',gap:6}}>
              <button className="btn outline" style={{flex:1}}><Icon name="terminal" size={11}/> Open thought log</button>
            </div>
          </div>

          <div className="prop-group">
            <div className="prop-group-title">Shortcuts</div>
            <ShortcutRow keys={['⌘','[']} label="Toggle left panel"/>
            <ShortcutRow keys={['⌘',']']} label="Toggle right panel"/>
            <ShortcutRow keys={['G','O']} label="Go to Overview"/>
            <ShortcutRow keys={['G','P']} label="Go to Positions"/>
            <ShortcutRow keys={['G','L']} label="Go to Log"/>
            <ShortcutRow keys={['⌘','.']} label="Kill switch"/>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="statusbar">
        <div className="left">
          <div className="row" style={{gap:6}}><div className="dot-live"/> <span className="text-secondary">Alpaca Paper · connected</span></div>
          <span className="statusbar-clock">
            <span className={`mkt-dot ${live.data?.marketOpen ? 'open' : 'closed'}`}/>
            <span className="text-secondary">Market {live.data ? (live.data.marketOpen ? 'OPEN' : 'CLOSED') : 'OPEN'}</span>
            {live.data?.nextClose && <span className="text-tertiary">· closes {new Date(live.data.nextClose).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',timeZone:'America/New_York'})} ET</span>}
          </span>
          <span>VIX 18.4</span>
          <span>SPY {fmt.usd(MOCK.watchlist[0].price)}</span>
        </div>
        <div className="right">
          <span>BP <span className="mono text-secondary">{fmt.usd(live.data?.buyingPower ?? portfolio.totalEquity * 1.95, 0)}</span></span>
          <span title="Pattern Day Trader counter">Daytrades <span className="mono text-secondary">{live.data?.daytrades ?? 1}/3</span></span>
          <span>{livePositionCount} pos · {fmt.usd(liveEquity,0)} equity</span>
          <span>guards: <span className="text-pos">OK</span></span>
          <span>v0.1.0-paper</span>
        </div>
      </div>

      {/* Tweaks panel */}
      {showTweaks && (
        <div className="tweaks-panel">
          <div className="tweaks-head">
            <span>Tweaks</span>
            <button className="icon-btn" onClick={() => setShowTweaks(false)} aria-label="Close tweaks"><Icon name="x" size={11}/></button>
          </div>
          <div className="tweaks-body">
            <div className="tweak-row"><span className="tk-label">Theme</span>
              <Segmented value={tweaks.theme} onChange={v => updateTweak('theme', v)} options={[{label:'Dark',value:'dark'},{label:'Light',value:'light'}]}/>
            </div>
            <div className="tweak-row"><span className="tk-label">Demo data</span>
              <Segmented value={tweaks.mode} onChange={v => updateTweak('mode', v)} options={[{label:'On',value:'active'},{label:'Off',value:'empty'}]}/>
            </div>
            <div className="tweak-row"><span className="tk-label">Density</span>
              <Segmented value={tweaks.density} onChange={v => updateTweak('density', v)} options={[{label:'Comfy',value:'comfortable'},{label:'Compact',value:'compact'}]}/>
            </div>
            <div className="tweak-row"><span className="tk-label">Agent persona</span>
              <Toggle on={tweaks.agentPersona} onChange={v => updateTweak('agentPersona', v)} aria-label="Agent persona"/>
            </div>
            <div className="tweak-row" style={{alignItems:'flex-start'}}>
              <span className="tk-label">Accent</span>
              <div style={{display:'flex',gap:6}}>
                {['#0d99ff','#7c5cff','#14ae5c','#f24822','#ffa629'].map(c => (
                  <button key={c} onClick={() => updateTweak('accent', c)} aria-label={`Set accent ${c}`} style={{width:18,height:18,borderRadius:4,background:c,border:tweaks.accent===c?'2px solid white':'1px solid var(--border-strong)',boxShadow:tweaks.accent===c?`0 0 0 2px ${c}`:'none'}}/>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <Modal open={!!confirmClose} onClose={() => setConfirmClose(null)}
        title={`Close ${confirmClose?.symbol}?`}
        description={`Marktorder om ${confirmClose?.qty} shares te sluiten op ~${fmt.usd(confirmClose?.currentPrice || 0)}. Dit overruled de strategie-exit-ladder.`}
        footer={<><button className="btn ghost" onClick={() => setConfirmClose(null)}>Cancel</button><button className="btn danger" onClick={doClose}>Close position</button></>}>
        {confirmClose && (
          <div style={{padding:10,background:'var(--bg-app)',borderRadius:6,fontSize:11}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <div><div className="text-tertiary" style={{fontSize:10}}>Entry</div><div className="mono">{fmt.usd(confirmClose.avgEntryPrice)}</div></div>
              <div><div className="text-tertiary" style={{fontSize:10}}>Mark</div><div className="mono">{fmt.usd(confirmClose.currentPrice)}</div></div>
              <div><div className="text-tertiary" style={{fontSize:10}}>Unrealized</div><div className="mono" style={{color:confirmClose.unrealizedPnl>=0?'var(--pos)':'var(--neg)'}}>{fmt.signedUsd(confirmClose.unrealizedPnl)} · {fmt.pct(confirmClose.unrealizedPnlPct)}</div></div>
              <div><div className="text-tertiary" style={{fontSize:10}}>Quantity</div><div className="mono">{confirmClose.qty}</div></div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={confirmKill} onClose={() => setConfirmKill(false)}
        title={guards.tradingEnabled ? 'Disable trading?' : 'Re-enable trading?'}
        description={guards.tradingEnabled ? 'Dit stopt alle orderverzending direct. Bestaande posities worden nog beheerd; stops blijven actief.' : 'Trading wordt geactiveerd. De agent kan weer orders inleggen na het doorlopen van de guards.'}
        footer={<><button className="btn ghost" onClick={() => setConfirmKill(false)}>Cancel</button><button className={guards.tradingEnabled ? 'btn danger' : 'btn success'} onClick={doKillSwitch}>{guards.tradingEnabled ? 'Disable' : 'Enable'} trading</button></>}>
        <div style={{padding:10,background:'var(--bg-app)',borderRadius:6,fontSize:11,color:'var(--text-secondary)'}}>
          <Icon name="bolt" size={11}/> Dit zet <span className="mono" style={{color:'var(--text-primary)'}}>TRADING_ENABLED={guards.tradingEnabled ? 'false' : 'true'}</span> en slaat op in session-state.
        </div>
      </Modal>

      <Modal open={!!selectedDecision} onClose={() => setSelectedDecision(null)}
        title={selectedDecision ? `${selectedDecision.symbol} · ${selectedDecision.decision}` : ''}
        description={selectedDecision ? fmt.timeS(selectedDecision.ts) : ''}
        footer={<button className="btn ghost" onClick={() => setSelectedDecision(null)}>Close</button>}>
        {selectedDecision && (
          <div>
            <div style={{padding:10,background:'var(--bg-app)',borderRadius:6,fontSize:11,color:'var(--text-secondary)',marginBottom:14}}>
              <Icon name="bolt" size={11}/> <span style={{color:'var(--text-primary)'}}>&quot;{selectedDecision.agentNote}&quot;</span>
            </div>
            {selectedDecision.criteria && (
              <>
                <div className="text-tertiary" style={{fontSize:10,textTransform:'uppercase',letterSpacing:0.05,marginBottom:8}}>Entry Criteria</div>
                <div style={{display:'grid',gap:4,marginBottom:14}}>
                  {Object.entries(selectedDecision.criteria).map(([k, v]) => (
                    <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'6px 8px',background:v==='pass'?'var(--pos-dim)':'var(--neg-dim)',borderRadius:4,fontSize:11}}>
                      <span className="mono" style={{color:'var(--text-secondary)'}}>{k}</span>
                      <span style={{color:v==='pass'?'var(--pos)':'var(--neg)',fontWeight:500}}>{v.toUpperCase()}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="text-tertiary" style={{fontSize:10,textTransform:'uppercase',letterSpacing:0.05,marginBottom:6}}>Rationale</div>
            <p style={{fontSize:11,margin:0,lineHeight:1.5}}>{selectedDecision.rationale}</p>
            {selectedDecision.orderId && <div style={{marginTop:12,fontSize:10,color:'var(--text-tertiary)'}}>Order ID: <span className="mono">{selectedDecision.orderId}</span></div>}
          </div>
        )}
      </Modal>

      <Modal open={!!confirmRoutine} onClose={() => setConfirmRoutine(null)}
        title={confirmRoutine ? `Run ${confirmRoutine.name}?` : ''}
        description={confirmRoutine ? `Handmatige trigger. De routine wordt normaal gescheduled op ${confirmRoutine.time}.` : ''}
        footer={<><button className="btn ghost" onClick={() => setConfirmRoutine(null)}>Cancel</button><button className="btn primary" onClick={doTriggerRoutine}>Run now</button></>}>
        {confirmRoutine && (
          <div style={{padding:10,background:'var(--bg-app)',borderRadius:6,fontSize:11,color:'var(--text-secondary)'}}>{confirmRoutine.summary}</div>
        )}
      </Modal>

      {/* Toast */}
      {toast && (
        <div style={{position:'fixed',bottom:36,left:'50%',transform:'translateX(-50%)',background:'var(--bg-card)',border:'1px solid var(--border-strong)',borderRadius:8,padding:'10px 16px',fontSize:12,boxShadow:'var(--shadow-float)',zIndex:60,display:'flex',alignItems:'center',gap:10}}>
          <Icon name="bolt" size={12} className="text-accent"/>
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}

function GateRow({ label, v, ok, lim, msg }: { label: string; v: string; ok?: boolean; lim?: string; msg?: string }) {
  return (
    <div className="prop-row">
      <span className="k">{label}</span>
      <span className="v" style={{display:'flex',alignItems:'center',gap:6}}>
        <span style={{color:ok?'var(--pos)':'var(--neg)'}}>{msg||v}</span>
        {lim && <span className="text-tertiary">{lim}</span>}
      </span>
    </div>
  );
}

function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'4px 0',fontSize:11}}>
      <span className="text-secondary">{label}</span>
      <div style={{display:'flex',gap:2}}>
        {keys.map((k, i) => <kbd key={i} style={{padding:'1px 5px',background:'var(--bg-input)',borderRadius:3,fontSize:10,fontFamily:'var(--font-mono)',color:'var(--text-secondary)',border:'1px solid var(--border-subtle)'}}>{k}</kbd>)}
      </div>
    </div>
  );
}
