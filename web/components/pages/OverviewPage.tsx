'use client';
import { useState, useEffect } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { Segmented } from '@/components/ui/Segmented';
import { Sparkline } from '@/components/charts/Sparkline';
import { EquityChart } from '@/components/charts/EquityChart';
import { SessionKickoff } from '@/components/ui/SessionKickoff';
import { fmt } from '@/lib/format';
import { MOCK } from '@/lib/mock';

interface Portfolio {
  totalEquity: number;
  cashBalance: number;
  dayStartEquity: number;
  dailyPnl: number;
  dailyPnlPct: number;
  positions: Position[];
}
interface Position {
  symbol: string; name: string; sector: string;
  qty: number; avgEntryPrice: number; currentPrice: number;
  highWatermark: number; entryAt: string;
  stopLoss: number; trailingStop: number; takeProfit: number; sma20: number;
  marketValue: number; costBasis: number;
  unrealizedPnl: number; unrealizedPnlPct: number;
  sparkline?: number[];
}
interface Decision { id: string; symbol: string; decision: string; ts: string; agentNote?: string; rationale: string; criteria?: Record<string, string>; routine: string; orderId?: string; }

interface KickoffOption {
  symbol: string; thesis: string; rationale: string; confidence: number;
  criteria: Record<string, 'pass' | 'fail'>; entryZone: string; stopLevel: string;
}

interface OverviewPageProps {
  portfolio: Portfolio;
  mode: string;
  tweaks: Record<string, unknown>;
  marketOpen: boolean | null;
  onOpenDecision: (d: Decision) => void;
  onTriggerRoutine: (r: unknown) => void;
  onClosePosition: (p: Position) => void;
  onOpenKillSwitch: () => void;
  onKickoffSelect: (opt: KickoffOption) => void;
  liveTick: boolean;
}

export function OverviewPage({ portfolio, mode, marketOpen, onOpenDecision, onTriggerRoutine, onClosePosition, onOpenKillSwitch, onKickoffSelect, liveTick }: OverviewPageProps) {
  const [range, setRange] = useState('1D');
  const [now, setNow] = useState(() => new Date());
  const isEmpty = mode === 'empty';

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const equityPoints = range === '1D' ? MOCK.equityIntraday : MOCK.equityDaily.slice(range === '1W' ? -7 : range === '1M' ? -30 : 0);

  const dailyPos = portfolio.dailyPnl >= 0;
  const nextRoutine = MOCK.routines.find(r => r.status === 'next') || MOCK.routines[3];
  const countdownMs = new Date(nextRoutine.nextRun).getTime() - now.getTime();
  const hrs = Math.max(0, Math.floor(countdownMs / 3600000));
  const mins = Math.max(0, Math.floor((countdownMs % 3600000) / 60000));

  const agentNotes: Array<{ t: string; kind: string; symbol?: string; decision?: string; title?: string; note: string; onClick?: () => void }> = isEmpty
    ? [
        { t: '08:30:08', kind: 'accent', title: 'Premarket klaar', note: 'Ik heb de watchlist opgebouwd. 10 ETFs gescand, indicatoren berekend op daily bars. Klaar voor market-open.' },
        { t: '08:25:00', kind: 'muted', title: 'Sessie gestart', note: 'Cash $100,000. Geen open posities. Trading is enabled, circuit breakers zijn rustig.' }
      ]
    : (MOCK.decisions as unknown as Decision[]).slice(0, 6).map(d => ({
        t: fmt.timeS(d.ts),
        kind: d.decision === 'BUY' ? 'pos' : d.decision === 'NO_GO' ? 'muted' : d.decision === 'GATE_CHECK' || d.decision === 'WATCHLIST' ? 'accent' : 'muted',
        symbol: d.symbol !== '—' ? d.symbol : undefined,
        decision: d.decision,
        note: d.agentNote || d.rationale,
        onClick: () => onOpenDecision(d)
      }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{isEmpty ? 'Pre-sessie · klaar om te handelen' : 'Sessie loopt · 2 posities open'}</h1>
          <div className="subtitle text-secondary">
            {isEmpty
              ? 'Cash volledig beschikbaar. Ik wacht op market-open om de watchlist af te gaan.'
              : 'Ik heb vanochtend QQQ en XLK genomen op breakouts. Beide in range, stops staan. Volgende check: midday trailing update.'}
          </div>
        </div>
        <div className="meta">
          <div className="meta-row">
            <span>{now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' })}</span>
            <span className="meta-sep">·</span>
            <span>{now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/New_York' })} ET</span>
          </div>
          <div className="meta-row">
            <Pill kind={marketOpen ? 'pos' : 'muted'} dot={!!marketOpen} pulse={!!marketOpen}>
              {marketOpen === null ? 'CHECKING…' : marketOpen ? 'MARKET OPEN' : 'MARKET CLOSED'}
            </Pill>
          </div>
        </div>
      </div>

      {isEmpty && <SessionKickoff onSelect={onKickoffSelect}/>}

      {!isEmpty && (
        <div className="news-strip">
          <div className="news-strip-label">
            <Icon name="zap" size={11}/>
            <span>Market news</span>
            <span className="text-tertiary" style={{fontSize: 10}}>· via Alpaca</span>
          </div>
          <div className="news-track">
            <div className="news-item"><span className="mono news-time">12:48</span><span className="news-sym">QQQ</span><span>Nasdaq-100 breakout test — 1.12× avg volume in laatste uur.</span></div>
            <div className="news-sep">·</div>
            <div className="news-item"><span className="mono news-time">12:31</span><span className="news-sym">SPY</span><span>Fed minutes later vandaag (14:00 ET) — reguliere watchlist-scan daarna.</span></div>
            <div className="news-sep">·</div>
            <div className="news-item"><span className="mono news-time">11:52</span><span>Tech sector leads — XLK +0.8%, semis mixed.</span></div>
          </div>
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label"><Icon name="dollar" size={12}/> Total Equity</div>
          <div className={`kpi-value${liveTick ? ' tick-up' : ''}`}>{fmt.usd(portfolio.totalEquity)}</div>
          <div className={`kpi-delta ${dailyPos ? 'pos' : 'neg'}`}>
            <Icon name={dailyPos ? 'up' : 'down'} size={10}/>
            {fmt.signedUsd(portfolio.dailyPnl)} <span className="text-tertiary">·</span> {fmt.pct(portfolio.dailyPnlPct)} today
          </div>
          <div className="kpi-spark"><Sparkline points={equityPoints.map(p => p.v)} width={80} height={28}/></div>
        </div>
        <div className="kpi">
          <div className="kpi-label"><Icon name="wifi" size={12}/> Cash Balance</div>
          <div className="kpi-value">{fmt.usd(portfolio.cashBalance)}</div>
          <div className="kpi-delta neutral">{((portfolio.cashBalance / portfolio.totalEquity) * 100).toFixed(1)}% of equity <span className="text-tertiary">·</span> floor 10%</div>
        </div>
        <div className="kpi">
          <div className="kpi-label"><Icon name="positions" size={12}/> Open Positions</div>
          <div className="kpi-value">{portfolio.positions.length}<span style={{fontSize: 13, color: 'var(--text-tertiary)'}}>/3</span></div>
          <div className="kpi-delta neutral">
            {isEmpty ? 'No deployments · awaiting open' : `${((portfolio.positions.reduce((s, p) => s + p.marketValue, 0) / portfolio.totalEquity) * 100).toFixed(1)}% deployed`}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label"><Icon name="clock" size={12}/> Next Routine</div>
          <div className="kpi-value" style={{fontSize: 20}}>{nextRoutine.name}</div>
          <div className="kpi-delta neutral">in {hrs}h {mins}m <span className="text-tertiary">·</span> {nextRoutine.time}</div>
        </div>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: '1.6fr 1fr' }}>
        <div className="card">
          <div className="card-head">
            <h3><Icon name="dashboard" size={12}/> Equity Curve</h3>
            <div className="right">
              <Segmented value={range} onChange={setRange} options={[{label:'1D',value:'1D'},{label:'1W',value:'1W'},{label:'1M',value:'1M'},{label:'YTD',value:'YTD'}]}/>
              <button className="icon-btn" title="Expand" aria-label="Expand chart"><Icon name="arrow_ne" size={12}/></button>
            </div>
          </div>
          <div className="card-body">
            {isEmpty
              ? <div style={{height:260,display:'grid',placeItems:'center',color:'var(--text-tertiary)',fontSize:11}}><div style={{textAlign:'center'}}><Icon name="dashboard" size={32}/><div style={{marginTop:8}}>Geen sessiedata — curve verschijnt bij de eerste tick.</div></div></div>
              : <EquityChart points={equityPoints} height={260}/>}
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <h3><Icon name="bolt" size={12}/> Agent Activity</h3>
            <div className="right"><Pill kind="accent" dot pulse>LIVE</Pill></div>
          </div>
          <div className="card-body flush feed" style={{maxHeight:308,overflowY:'auto'}}>
            {agentNotes.map((n, i) => (
              <div key={i} className="feed-item" style={n.onClick ? {cursor:'pointer'} : {}} onClick={n.onClick}>
                <div className={`feed-icon ${n.kind}`}>
                  <Icon name={n.kind==='pos'?'check':n.kind==='neg'?'x':n.kind==='accent'?'bolt':'clock'} size={10}/>
                </div>
                <div className="feed-body">
                  <div className="feed-title">
                    {n.symbol && <span className="feed-sym">{n.symbol}</span>}
                    {n.decision && <span className={`feed-dec ${n.kind}`}>{n.decision}</span>}
                    {n.title && <span>{n.title}</span>}
                  </div>
                  <div className="feed-note">{n.note}</div>
                </div>
                <div className="feed-time">{n.t}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: '1.3fr 1fr' }}>
        <PositionsCard positions={portfolio.positions} onClose={onClosePosition}/>
        <WatchlistCard items={MOCK.watchlist}/>
      </div>

      <div className="card">
        <div className="card-head">
          <h3><Icon name="routines" size={12}/> Today&apos;s Routines</h3>
          <div className="right"><button className="btn ghost"><Icon name="refresh" size={12}/> Refresh</button></div>
        </div>
        <div className="card-body">
          <div className="routines-grid">
            {MOCK.routines.map(r => (
              <div key={r.id} className={`routine-card${r.status === 'next' ? ' next' : ''}`} onClick={() => onTriggerRoutine(r)} style={{cursor:'pointer'}}>
                <div className="r-time mono">{r.time}</div>
                <div className="r-name">{r.name}</div>
                <div className="r-status">
                  {r.status === 'done' && <><Icon name="check" size={10}/> <span className="text-pos">Completed</span></>}
                  {r.status === 'next' && <><span style={{width:6,height:6,borderRadius:3,background:'var(--accent)',display:'inline-block'}}/> <span className="text-accent">Up next</span></>}
                  {r.status === 'scheduled' && <><Icon name="clock" size={10}/> <span className="text-tertiary">Scheduled</span></>}
                </div>
                <div className="text-tertiary" style={{fontSize:10,lineHeight:1.4}}>{r.summary}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <GuardSnapshot guards={MOCK.guards} onOpenKill={onOpenKillSwitch}/>
    </>
  );
}

function PositionsCard({ positions, onClose }: { positions: Position[]; onClose: (p: Position) => void }) {
  return (
    <div className="card">
      <div className="card-head">
        <h3><Icon name="positions" size={12}/> Open Positions <span className="text-tertiary mono" style={{fontSize:10,marginLeft:4}}>{positions.length}/3</span></h3>
        <div className="right"><button className="icon-btn" title="Filter" aria-label="Filter positions"><Icon name="filter" size={12}/></button></div>
      </div>
      <div className="card-body flush">
        {positions.length === 0 ? (
          <div style={{padding:28,textAlign:'center',color:'var(--text-tertiary)',fontSize:11}}>
            <Icon name="positions" size={24}/><div style={{marginTop:6}}>Geen open posities. Market-open routine draait om 09:35.</div>
          </div>
        ) : (
          <table className="data">
            <thead><tr><th>Symbol</th><th className="num">Qty</th><th className="num">Entry</th><th className="num">Mark</th><th>Stops</th><th className="num">Unrealized</th><th></th></tr></thead>
            <tbody>
              {positions.map(p => {
                const pos = p.unrealizedPnl >= 0;
                const stopRange = p.takeProfit - p.stopLoss;
                const markerPos = ((p.currentPrice - p.stopLoss) / stopRange) * 100;
                const trailMarkerPos = ((p.trailingStop - p.stopLoss) / stopRange) * 100;
                return (
                  <tr key={p.symbol} className="row-interactive">
                    <td><div className="sym">{p.symbol}</div><div className="text-tertiary" style={{fontSize:10}}>{p.sector}</div></td>
                    <td className="num">{p.qty}</td>
                    <td className="num">{fmt.usd(p.avgEntryPrice)}</td>
                    <td className="num" style={{color:pos?'var(--pos)':'var(--neg)'}}>{fmt.usd(p.currentPrice)}</td>
                    <td>
                      <div style={{width:140}}>
                        <div className="stops-gauge">
                          <div className="fill"/>
                          <div className="marker" style={{left:`${Math.max(2,Math.min(98,trailMarkerPos))}%`,background:'var(--warn)'}} title="Trailing stop"/>
                          <div className="marker" style={{left:`${Math.max(2,Math.min(98,markerPos))}%`}} title="Current"/>
                        </div>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:9,color:'var(--text-tertiary)',marginTop:2,fontFamily:'var(--font-mono)'}}>
                          <span>{fmt.usd(p.stopLoss)}</span><span>{fmt.usd(p.takeProfit)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="num">
                      <div style={{color:pos?'var(--pos)':'var(--neg)',fontWeight:500}}>{fmt.signedUsd(p.unrealizedPnl)}</div>
                      <div className="text-tertiary" style={{fontSize:10}}>{fmt.pct(p.unrealizedPnlPct)}</div>
                    </td>
                    <td><button className="icon-btn" onClick={e => {e.stopPropagation(); onClose(p);}} title="Close position" aria-label={`Close ${p.symbol}`}><Icon name="x" size={12}/></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

interface WatchlistItem { symbol: string; name: string; price: number; sma20: number; sma50: number; fiveDayHigh: number; rsi14: number; volRatio: number; open: boolean; }

function WatchlistCard({ items }: { items: WatchlistItem[] }) {
  const evaluateCandidate = (w: WatchlistItem) => {
    const checks = [w.price > w.sma20, w.price > w.sma50, w.price > w.fiveDayHigh, w.volRatio >= 1.1, w.rsi14 >= 50 && w.rsi14 <= 75, !w.open];
    return checks.filter(Boolean).length;
  };
  return (
    <div className="card">
      <div className="card-head"><h3><Icon name="eye" size={12}/> Watchlist <span className="text-tertiary mono" style={{fontSize:10,marginLeft:4}}>10</span></h3></div>
      <div className="card-body flush" style={{maxHeight:340,overflowY:'auto'}}>
        <table className="data">
          <thead><tr><th>Symbol</th><th className="num">Price</th><th className="num">RSI</th><th className="num">Vol×</th><th>Criteria</th></tr></thead>
          <tbody>
            {items.map(w => {
              const passCount = evaluateCandidate(w);
              return (
                <tr key={w.symbol} className="row-interactive">
                  <td>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <div className="sym">{w.symbol}</div>
                      {w.open && <span style={{fontSize:9,color:'var(--accent)',background:'var(--accent-dim)',padding:'1px 5px',borderRadius:3,fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:0.05}}>Held</span>}
                    </div>
                    <div className="text-tertiary" style={{fontSize:10}}>{w.name}</div>
                  </td>
                  <td className="num">{fmt.usd(w.price)}</td>
                  <td className="num" style={{color:w.rsi14>=50&&w.rsi14<=75?'var(--pos)':'var(--text-secondary)'}}>{w.rsi14.toFixed(1)}</td>
                  <td className="num" style={{color:w.volRatio>=1.1?'var(--pos)':'var(--text-secondary)'}}>{w.volRatio.toFixed(2)}</td>
                  <td><div className="criteria">{[0,1,2,3,4,5].map(i => <div key={i} className={`crit-dot${i < passCount ? ' pass' : ''}`}/>)}</div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface GuardData {
  tradingEnabled: boolean; circuitBreakerTripped: boolean;
  dailyDrawdownPct: number; peakDrawdownPct: number;
  dailyDrawdownLimit: number; peakDrawdownLimit: number;
  consecLosses: number; consecLossesLimit: number;
  tradesLast10Min: number; tradesLast10MinLimit: number;
}

function GuardSnapshot({ guards: g, onOpenKill }: { guards: GuardData; onOpenKill: () => void }) {
  const rows = [
    { label: 'Kill switch', value: g.tradingEnabled ? 'ENABLED' : 'DISABLED', kind: g.tradingEnabled ? 'pos' : 'neg', icon: 'unlock' },
    { label: 'Circuit breaker', value: g.circuitBreakerTripped ? 'TRIPPED' : 'Standby', kind: g.circuitBreakerTripped ? 'neg' : 'muted', icon: 'shield' },
    { label: 'Daily DD', value: `${g.dailyDrawdownPct.toFixed(2)}% / ${g.dailyDrawdownLimit}%`, kind: 'muted', icon: 'down' },
    { label: 'Peak DD', value: `${g.peakDrawdownPct.toFixed(2)}% / ${g.peakDrawdownLimit}%`, kind: 'muted', icon: 'down' },
    { label: 'Consec losses', value: `${g.consecLosses} / ${g.consecLossesLimit}`, kind: 'muted', icon: 'minus' },
    { label: 'Orders / 10min', value: `${g.tradesLast10Min} / ${g.tradesLast10MinLimit}`, kind: 'muted', icon: 'zap' }
  ];
  return (
    <div className="card">
      <div className="card-head">
        <h3><Icon name="shield" size={12}/> Risk &amp; Guards</h3>
        <div className="right"><button className="btn outline" onClick={onOpenKill}><Icon name={g.tradingEnabled?'unlock':'lock'} size={12}/> Kill switch</button></div>
      </div>
      <div className="card-body" style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:12}}>
        {rows.map((r, i) => (
          <div key={i} style={{background:'var(--bg-app)',border:'1px solid var(--border-subtle)',borderRadius:6,padding:10}}>
            <div className="text-tertiary" style={{fontSize:10,display:'flex',alignItems:'center',gap:4,marginBottom:6}}>
              <Icon name={r.icon as Parameters<typeof Icon>[0]['name']} size={10}/> {r.label}
            </div>
            <div style={{fontFamily:'var(--font-mono)',fontSize:12,fontWeight:500}}>
              {r.kind==='pos'&&<span className="text-pos">{r.value}</span>}
              {r.kind==='neg'&&<span className="text-neg">{r.value}</span>}
              {r.kind==='muted'&&<span>{r.value}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
