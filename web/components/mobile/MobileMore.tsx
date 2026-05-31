'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { fmt } from '@/lib/format';
import { MOCK } from '@/lib/mock';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { Sheet } from './Sheet';

type Guards = { tradingEnabled: boolean; circuitBreakerTripped: boolean; dailyDrawdownPct: number; dailyDrawdownLimit: number; peakDrawdownPct: number; peakDrawdownLimit: number; consecLosses: number; consecLossesLimit: number; openPositions: number; maxOpenPositions: number; dailyTrades: number; maxDailyTrades: number; cashReservePct: number; cashReserveMin: number };

type SubView = 'risk' | 'routines' | 'strategy' | 'conversations' | 'lessons' | 'history';

const TILES: { id: SubView; icon: Parameters<typeof Icon>[0]['name']; title: string; desc: string }[] = [
  { id: 'risk', icon: 'shield', title: 'Risico & Guards', desc: 'Kill switch, drawdown, limieten' },
  { id: 'routines', icon: 'routines', title: 'Routines', desc: '5 geplande taken' },
  { id: 'strategy', icon: 'strategy', title: 'Strategie', desc: 'Momentum breakout-regels' },
  { id: 'conversations', icon: 'chat', title: 'Gesprekken', desc: 'Threads met de agent' },
  { id: 'lessons', icon: 'sparkle', title: 'Lessen', desc: 'Wat de agent leerde' },
  { id: 'history', icon: 'history', title: 'Historie', desc: 'Gesloten posities' },
];

export function MobileMore({ guards, onToggleKill, dataLive, onRefresh }: { guards: Guards; onToggleKill: () => void; dataLive: boolean; onRefresh: () => void }) {
  const [view, setView] = useState<SubView | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const title = TILES.find(t => t.id === view)?.title ?? '';

  return (
    <>
      <button className="m-row" onClick={onRefresh}>
        <span style={{ color: dataLive ? 'var(--pos)' : 'var(--neg)', display: 'flex' }}><Icon name="wifi" size={18} /></span>
        <div className="m-row-main">
          <div style={{ fontSize: 13, fontWeight: 600 }}>Databron</div>
          <div className="m-row-sub">{dataLive ? 'Live · Alpaca paper' : 'Dummy data — geen live verbinding'}</div>
        </div>
        <Icon name="refresh" size={15} />
      </button>

      <div className="m-more-grid">
        {TILES.map(t => (
          <button key={t.id} className="m-more-tile" onClick={() => setView(t.id)}>
            <div className="ico"><Icon name={t.icon} size={17} /></div>
            <div>
              <div className="ttl">{t.title}</div>
              <div className="desc">{t.desc}</div>
            </div>
          </button>
        ))}
      </div>

      {view && mounted && createPortal(
        <div className="m-subview">
          <div className="m-subhead">
            <button className="m-back" onClick={() => setView(null)}><Icon name="chev" size={14} /> Meer</button>
            <span className="m-subtitle">{title}</span>
          </div>
          <div className="m-scroll" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
            {view === 'risk' && <RiskView guards={guards} onToggleKill={onToggleKill} />}
            {view === 'routines' && <RoutinesView />}
            {view === 'strategy' && <StrategyView />}
            {view === 'conversations' && <ConversationsView />}
            {view === 'lessons' && <LessonsView />}
            {view === 'history' && <HistoryView />}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function bar(pct: number, limit: number, color: string) {
  const ratio = Math.min(1, Math.abs(pct) / Math.abs(limit || 1));
  return <div className="m-bar"><span style={{ width: `${ratio * 100}%`, background: color }} /></div>;
}

function RiskView({ guards: g, onToggleKill }: { guards: Guards; onToggleKill: () => void }) {
  return (
    <>
      <div className="m-card">
        <div className="m-card-title"><span>Kill switch</span>{g.tradingEnabled ? <Pill kind="pos" dot pulse>ACTIEF</Pill> : <Pill kind="neg" dot>UIT</Pill>}</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 12 }}>
          {g.tradingEnabled ? 'De agent mag orders inleggen. Druk om alle nieuwe orders direct te stoppen.' : 'Trading staat uit. Bestaande posities worden nog beheerd; stops blijven actief.'}
        </div>
        <button className={`m-btn ${g.tradingEnabled ? 'danger' : 'success'}`} onClick={onToggleKill}>
          <Icon name={g.tradingEnabled ? 'lock' : 'unlock'} size={15} /> {g.tradingEnabled ? 'Trading stoppen' : 'Trading inschakelen'}
        </button>
      </div>

      <div className="m-card">
        <div className="m-card-title">Drawdown</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: 'var(--text-secondary)' }}>Vandaag</span><span style={{ fontFamily: 'var(--font-mono)' }}>{g.dailyDrawdownPct.toFixed(2)}% / {g.dailyDrawdownLimit.toFixed(1)}%</span></div>
        {bar(g.dailyDrawdownPct, g.dailyDrawdownLimit, 'var(--warn)')}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 14 }}><span style={{ color: 'var(--text-secondary)' }}>Piek</span><span style={{ fontFamily: 'var(--font-mono)' }}>{g.peakDrawdownPct.toFixed(2)}% / {g.peakDrawdownLimit.toFixed(1)}%</span></div>
        {bar(g.peakDrawdownPct, g.peakDrawdownLimit, 'var(--warn)')}
      </div>

      <div className="m-card">
        <div className="m-card-title">Limieten</div>
        <div className="m-kv"><span className="k">Circuit breaker</span><span className="v">{g.circuitBreakerTripped ? <Pill kind="neg" dot>GETRIPT</Pill> : <Pill kind="muted">Standby</Pill>}</span></div>
        <div className="m-kv"><span className="k">Verliezen op rij</span><span className="v">{g.consecLosses} / {g.consecLossesLimit}</span></div>
        <div className="m-kv"><span className="k">Open posities</span><span className="v">{g.openPositions} / {g.maxOpenPositions}</span></div>
        <div className="m-kv"><span className="k">Trades vandaag</span><span className="v">{g.dailyTrades} / {g.maxDailyTrades}</span></div>
        <div className="m-kv"><span className="k">Cash-reserve</span><span className="v">{g.cashReservePct.toFixed(1)}% (min {g.cashReserveMin}%)</span></div>
      </div>
    </>
  );
}

function RoutinesView() {
  const statusKind = (s: string): 'pos' | 'accent' | 'muted' => s === 'done' ? 'pos' : s === 'next' ? 'accent' : 'muted';
  return (
    <>
      {MOCK.routines.map(r => (
        <div key={r.id} className="m-card">
          <div className="m-card-title"><span style={{ color: 'var(--text-primary)', textTransform: 'none', letterSpacing: 0, fontSize: 14, fontWeight: 600 }}>{r.name}</span><Pill kind={statusKind(r.status)} dot>{r.status === 'done' ? 'gedraaid' : r.status === 'next' ? 'volgende' : 'gepland'}</Pill></div>
          <div className="m-kv"><span className="k">Gepland</span><span className="v">{r.time}</span></div>
          <div className="m-kv"><span className="k">Laatste run</span><span className="v">{fmt.relTime(r.lastRun, MOCK.now)}</span></div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 10, lineHeight: 1.5 }}>{r.summary}</div>
        </div>
      ))}
    </>
  );
}

function StrategyView() {
  const entry = [
    'Koers boven SMA20', 'Koers boven SMA50', 'Breakout boven 5-daags hoogtepunt',
    'Volume-bevestiging (≥ 1.1×)', 'RSI in bereik (50–75)', 'Nog geen positie in dit symbool',
  ];
  const exits = [
    ['Harde stop', '−2% onder entry'], ['Trailing stop', '3% onder hoogtepunt'],
    ['Take profit', '+5% boven entry'], ['EOD close', 'Alles dicht om 16:10 ET'],
  ];
  const limits = [
    ['Max posities', '3 tegelijk'], ['Positiegrootte', '25% van equity'],
    ['Cash-floor', 'min. 10%'], ['Universe', '10 US ETFs'],
  ];
  return (
    <>
      <div className="m-card">
        <div className="m-card-title">Strategie</div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Momentum Breakout</div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>Koopt kracht die doorzet. Alle 6 entry-criteria moeten tegelijk waar zijn.</div>
      </div>
      <div className="m-card">
        <div className="m-card-title">Entry-criteria (6/6)</div>
        <div className="m-criteria">
          {entry.map((c, i) => (
            <div key={i} className="m-crit-row pass"><span className="label" style={{ fontFamily: 'var(--font-ui)', fontSize: 13 }}>{c}</span><span className="state pos"><Icon name="check" size={13} /></span></div>
          ))}
        </div>
      </div>
      <div className="m-card">
        <div className="m-card-title">Exits</div>
        {exits.map(([k, v]) => <div key={k} className="m-kv"><span className="k">{k}</span><span className="v" style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text-tertiary)' }}>{v}</span></div>)}
      </div>
      <div className="m-card">
        <div className="m-card-title">Limieten</div>
        {limits.map(([k, v]) => <div key={k} className="m-kv"><span className="k">{k}</span><span className="v" style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text-tertiary)' }}>{v}</span></div>)}
      </div>
    </>
  );
}

function ConversationsView() {
  const [sel, setSel] = useState<typeof MOCK.threads[0] | null>(null);
  return (
    <>
      {MOCK.threads.map(t => (
        <button key={t.id} className="m-row" onClick={() => setSel(t)}>
          <div className="m-row-main">
            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>{t.title}</div>
            <div className="m-row-sub" style={{ marginTop: 4 }}>{t.tags.join(' ')} · {fmt.relTime(t.lastAt, MOCK.now)}</div>
          </div>
          {t.unread > 0 && <span className="m-badge hold">{t.unread}</span>}
          <Icon name="chevR" size={14} />
        </button>
      ))}
      <Sheet open={!!sel} title={sel?.title ?? ''} sub={sel ? sel.tags.join(' ') : ''} onClose={() => setSel(null)}>
        {sel?.messages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.from === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%', background: m.from === 'user' ? 'var(--accent-dim)' : 'var(--bg-input)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '10px 13px' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', marginBottom: 5 }}>{m.from === 'user' ? 'Jij' : 'Agent'} · {fmt.relTime(m.at, MOCK.now)}</div>
            <div className="m-prose" style={{ fontSize: 13, color: 'var(--text-primary)' }}>{m.body}</div>
          </div>
        ))}
      </Sheet>
    </>
  );
}

function LessonsView() {
  return (
    <>
      {MOCK.lessons.map(l => (
        <div key={l.id} className="m-card">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}>{l.title}</div>
            <Pill kind={l.status === 'active' ? 'pos' : 'muted'} dot>{l.status === 'active' ? 'actief' : 'gepauzeerd'}</Pill>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.55, margin: '8px 0 10px' }}>{l.description}</div>
          <div className="m-kv" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
            <span className="k" style={{ textTransform: 'capitalize' }}>{l.category} · {l.hits}× toegepast</span>
            <span className="v" style={{ color: l.pnlImpact >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{fmt.signedUsd(l.pnlImpact)}</span>
          </div>
        </div>
      ))}
    </>
  );
}

function HistoryView() {
  // Afgeleid uit gesloten trades in de sessierapporten (geen aparte history-bron).
  const closed = MOCK.reports.flatMap(r => r.trades.filter(t => t.status === 'closed').map(t => ({ ...t, date: r.date })));
  if (closed.length === 0) return <div className="m-empty">Nog geen gesloten posities.</div>;
  return (
    <>
      {closed.map(t => {
        const pos = t.pnl >= 0;
        return (
          <div key={t.id} className="m-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="m-row-main">
                <div className="m-row-sym">{t.symbol}</div>
                <div className="m-row-sub">{fmt.date(t.date)} · {t.qty} st</div>
              </div>
              <div className="m-row-end">
                <span className={`big ${pos ? 'pos' : 'neg'}`}>{fmt.signedUsd(t.pnl)}</span>
                <span className={`small ${pos ? 'pos' : 'neg'}`}>{fmt.pct(t.pnlPct)}</span>
              </div>
            </div>
            <div className="m-statline" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              <div><div className="k">Entry</div><div className="v">{fmt.usd(t.entry)}</div></div>
              <div><div className="k">Exit</div><div className="v">{t.exit != null ? fmt.usd(t.exit) : '—'}</div></div>
              <div><div className="k">R</div><div className="v">{t.r != null ? `${t.r > 0 ? '+' : ''}${t.r}` : '—'}</div></div>
            </div>
          </div>
        );
      })}
    </>
  );
}
