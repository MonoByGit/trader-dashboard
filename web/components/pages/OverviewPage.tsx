'use client';
import { useState, useEffect } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { Segmented } from '@/components/ui/Segmented';
import { Sparkline } from '@/components/charts/Sparkline';
import { EquityChart } from '@/components/charts/EquityChart';
import { SessionKickoff } from '@/components/ui/SessionKickoff';
import { fmt } from '@/lib/format';
import { TRADER_ROUTINES } from '@/lib/routines-config';
import { intradayFromAccount } from '@/lib/live-portfolio';

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

interface GuardData {
  tradingEnabled: boolean; circuitBreakerTripped: boolean;
  dailyDrawdownPct: number; peakDrawdownPct: number;
  dailyDrawdownLimit: number; peakDrawdownLimit: number;
  consecLosses: number; consecLossesLimit: number;
  tradesLast10Min: number; tradesLast10MinLimit: number;
}

interface KickoffOption {
  symbol: string; thesis: string; rationale: string; confidence: number;
  criteria: Record<string, 'pass' | 'fail'>; entryZone: string; stopLevel: string;
}

interface OverviewPageProps {
  portfolio: Portfolio;
  guards: GuardData;
  marketOpen: boolean | null;
  accountLoading: boolean;
  onOpenDecision: (d: Decision) => void;
  onClosePosition: (p: Position) => void;
  onOpenKillSwitch: () => void;
  onKickoffSelect: (opt: KickoffOption) => void;
}

export function OverviewPage({
  portfolio, guards, marketOpen, accountLoading, onOpenDecision,
  onClosePosition, onOpenKillSwitch, onKickoffSelect,
}: OverviewPageProps) {
  const [range, setRange] = useState('1D');
  const [now, setNow] = useState(() => new Date());
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [snapshots, setSnapshots] = useState<Array<{
    trading_date: string;
    momentum_cumulative_return_pct: number | null;
    spy_cumulative_return_pct: number | null;
    equity: number;
  }>>([]);
  const [aiCostToday, setAiCostToday] = useState<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetch('/api/decisions?limit=50')
      .then(r => r.json())
      .then((data: unknown) => {
        const arr = Array.isArray(data) ? data : [];
        setDecisions(arr.map((raw: unknown) => {
          const d = raw as Record<string, unknown>;
          return {
            id: String(d.id ?? ''),
            symbol: String(d.symbol ?? ''),
            decision: String(d.decision ?? ''),
            ts: String(d.ts ?? d.created_at ?? ''),
            agentNote: String(d.agent_note ?? d.agentNote ?? ''),
            rationale: String(d.rationale ?? ''),
            criteria: (d.criteria as Record<string, string>) ?? undefined,
            routine: String(d.routine ?? ''),
            orderId: d.order_id ? String(d.order_id) : undefined,
          };
        }));
      })
      .catch(() => setDecisions([]));
  }, []);

  useEffect(() => {
    fetch('/api/snapshots?limit=400')
      .then(r => r.json())
      .then((data: unknown) => setSnapshots(Array.isArray(data) ? data as typeof snapshots : []))
      .catch(() => setSnapshots([]));
    fetch('/api/ai-costs')
      .then(r => r.json())
      .then((d: { todayUsd?: number }) => setAiCostToday(typeof d.todayUsd === 'number' ? d.todayUsd : 0))
      .catch(() => setAiCostToday(null));
  }, []);

  const accountSlice = accountLoading ? null : {
    equity: portfolio.totalEquity,
    cash: portfolio.cashBalance,
    dayPnl: portfolio.dailyPnl,
    dayPnlPct: portfolio.dailyPnlPct / 100,
  };
  const intradayNums = intradayFromAccount(accountSlice);
  const equityIntraday = intradayNums.map((v, i) => ({ t: i, v, label: i === 0 ? 'Open' : 'Now' }));

  const sliceSnapshots = (days: number) => {
    const rows = snapshots.slice(-days);
    const toIndex = (pct: number | null) => 100 + (pct ?? 0);
    return {
      momentum: rows.map((r, i) => ({ t: i, v: toIndex(r.momentum_cumulative_return_pct), label: r.trading_date })),
      spy: rows.map((r, i) => ({ t: i, v: toIndex(r.spy_cumulative_return_pct), label: r.trading_date })),
    };
  };
  const benchmark =
    range === '1W' ? sliceSnapshots(7)
      : range === '1M' ? sliceSnapshots(30)
        : range === 'YTD' ? sliceSnapshots(Math.max(30, snapshots.length))
          : null;
  const equityPoints = range === '1D' ? equityIntraday : benchmark?.momentum ?? [];
  const spyPoints = range === '1D' ? undefined : benchmark?.spy;

  const dailyPos = portfolio.dailyPnl >= 0;
  const isFlat = portfolio.positions.length === 0;
  const nextRoutine = TRADER_ROUTINES[0];

  type FeedNote = {
    t: string;
    kind: 'pos' | 'neg' | 'accent' | 'muted';
    note: string;
    title?: string;
    symbol?: string;
    decision?: string;
    onClick?: () => void;
  };

  const agentNotes: FeedNote[] = decisions.length === 0
    ? [{
        t: '—',
        kind: 'muted',
        title: 'Agent',
        note: isFlat
          ? 'Paper-rekening — geen open posities. Beslissingen verschijnen na de cron-routines.'
          : 'Live posities via Alpaca. Beslissingen verschijnen zodra routines draaien.',
      }]
    : decisions.slice(0, 6).map(d => ({
        t: fmt.timeS(d.ts),
        kind: d.decision === 'BUY' ? 'pos' as const : d.decision === 'NO_GO' ? 'muted' as const : d.decision === 'GATE_CHECK' || d.decision === 'WATCHLIST' ? 'accent' as const : 'muted' as const,
        symbol: d.symbol !== '—' ? d.symbol : undefined,
        decision: d.decision,
        note: d.agentNote || d.rationale,
        onClick: () => onOpenDecision(d),
      }));

  const headline = accountLoading
    ? 'Overview · laden…'
    : isFlat
      ? 'Pre-sessie · geen open posities'
      : `Sessie · ${portfolio.positions.length} positie${portfolio.positions.length === 1 ? '' : 's'} open`;

  const subtitle = accountLoading
    ? 'Alpaca-rekening ophalen…'
    : isFlat
      ? `${fmt.usd(portfolio.cashBalance)} cash beschikbaar. De agent wacht op geldige setups.`
      : `${fmt.usd(portfolio.cashBalance)} cash · stops en targets staan bij Alpaca.`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{headline}</h1>
          <div className="subtitle text-secondary">{subtitle}</div>
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

      {isFlat && !accountLoading && <SessionKickoff onSelect={onKickoffSelect}/>}

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label"><Icon name="dollar" size={12}/> Total Equity</div>
          <div className="kpi-value">{accountLoading ? '…' : fmt.usd(portfolio.totalEquity)}</div>
          <div className={`kpi-delta ${dailyPos ? 'pos' : 'neg'}`}>
            {accountLoading ? '…' : (
              <>
                <Icon name={dailyPos ? 'up' : 'down'} size={10}/>
                {fmt.signedUsd(portfolio.dailyPnl)} <span className="text-tertiary">·</span> {fmt.pct(portfolio.dailyPnlPct)}
              </>
            )}
          </div>
          <div className="kpi-spark">
            {!accountLoading && intradayNums.length >= 2 && <Sparkline points={intradayNums} width={80} height={28}/>}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label"><Icon name="wifi" size={12}/> Cash Balance</div>
          <div className="kpi-value">{accountLoading ? '…' : fmt.usd(portfolio.cashBalance)}</div>
          <div className="kpi-delta neutral">
            {accountLoading || portfolio.totalEquity <= 0
              ? '—'
              : `${((portfolio.cashBalance / portfolio.totalEquity) * 100).toFixed(1)}% of equity · floor 10%`}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label"><Icon name="positions" size={12}/> Open Positions</div>
          <div className="kpi-value">{portfolio.positions.length}<span style={{fontSize: 13, color: 'var(--text-tertiary)'}}>/3</span></div>
          <div className="kpi-delta neutral">
            {isFlat
              ? 'Geen posities · wacht op setup'
              : `${((portfolio.positions.reduce((s, p) => s + p.marketValue, 0) / portfolio.totalEquity) * 100).toFixed(1)}% deployed`}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label"><Icon name="clock" size={12}/> Volgende routine</div>
          <div className="kpi-value" style={{fontSize: 20}}>{nextRoutine.name}</div>
          <div className="kpi-delta neutral">{nextRoutine.time}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label"><Icon name="zap" size={12}/> AI-kosten vandaag</div>
          <div className="kpi-value">{aiCostToday === null ? '…' : fmt.usd(aiCostToday, 2)}</div>
          <div className="kpi-delta neutral">LLM · paper routines · tab AI-kosten</div>
        </div>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: '1.6fr 1fr' }}>
        <div className="card">
          <div className="card-head">
            <h3><Icon name="dashboard" size={12}/> Equity Curve</h3>
            <div className="right">
              <Segmented value={range} onChange={setRange} options={[{label:'1D',value:'1D'},{label:'1W',value:'1W'},{label:'1M',value:'1M'},{label:'YTD',value:'YTD'}]}/>
            </div>
          </div>
          <div className="card-body">
            {accountLoading ? (
              <div style={{height:260,display:'grid',placeItems:'center',color:'var(--text-tertiary)',fontSize:11}}>Laden…</div>
            ) : range !== '1D' && equityPoints.length < 2 ? (
              <div style={{height:260,display:'grid',placeItems:'center',color:'var(--text-tertiary)',fontSize:11}}>
                <div style={{textAlign:'center'}}><Icon name="dashboard" size={32}/><div style={{marginTop:8}}>Nog geen snapshots — EOD of backfill draaien.</div></div>
              </div>
            ) : equityPoints.length >= 2 ? (
              <EquityChart
                points={equityPoints}
                comparePoints={spyPoints && spyPoints.length >= 2 ? spyPoints : undefined}
                valueFormat={range === '1D' ? 'usd' : 'index'}
                height={260}
              />
            ) : (
              <div style={{height:260,display:'grid',placeItems:'center',color:'var(--text-tertiary)',fontSize:11}}>
                <div style={{textAlign:'center'}}><Icon name="dashboard" size={32}/><div style={{marginTop:8}}>Nog geen data voor vandaag.</div></div>
              </div>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <h3><Icon name="bolt" size={12}/> Agent Activity</h3>
            <div className="right"><Pill kind={decisions.length > 0 ? 'accent' : 'muted'} dot={decisions.length > 0} pulse={decisions.length > 0}>LIVE</Pill></div>
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
        <WatchlistCard heldSymbols={portfolio.positions.map(p => p.symbol)}/>
      </div>

      <GuardSnapshot guards={guards} onOpenKill={onOpenKillSwitch}/>
    </>
  );
}

function PositionsCard({ positions, onClose }: { positions: Position[]; onClose: (p: Position) => void }) {
  return (
    <div className="card">
      <div className="card-head">
        <h3><Icon name="positions" size={12}/> Open Positions <span className="text-tertiary mono" style={{fontSize:10,marginLeft:4}}>{positions.length}/3</span></h3>
      </div>
      <div className="card-body flush">
        {positions.length === 0 ? (
          <div style={{padding:28,textAlign:'center',color:'var(--text-tertiary)',fontSize:11}}>
            <Icon name="positions" size={24}/><div style={{marginTop:6}}>Nog geen open posities.</div>
          </div>
        ) : (
          <table className="data">
            <thead><tr><th>Symbol</th><th className="num">Qty</th><th className="num">Entry</th><th className="num">Mark</th><th className="num">Unrealized</th><th></th></tr></thead>
            <tbody>
              {positions.map(p => {
                const pos = p.unrealizedPnl >= 0;
                return (
                  <tr key={p.symbol} className="row-interactive">
                    <td><div className="sym">{p.symbol}</div><div className="text-tertiary" style={{fontSize:10}}>{p.name}</div></td>
                    <td className="num">{p.qty}</td>
                    <td className="num">{fmt.usd(p.avgEntryPrice)}</td>
                    <td className="num" style={{color:pos?'var(--pos)':'var(--neg)'}}>{fmt.usd(p.currentPrice)}</td>
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

function WatchlistCard({ heldSymbols }: { heldSymbols: string[] }) {
  return (
    <div className="card">
      <div className="card-head"><h3><Icon name="eye" size={12}/> Watchlist</h3></div>
      <div className="card-body" style={{padding:28,textAlign:'center',color:'var(--text-tertiary)',fontSize:11}}>
        <Icon name="eye" size={24}/>
        <div style={{marginTop:8}}>Nog geen data. Watchlist-scans verschijnen na de premarket-routine.</div>
        {heldSymbols.length > 0 && (
          <div style={{marginTop:12,fontSize:10}}>Open: {heldSymbols.join(', ')}</div>
        )}
      </div>
    </div>
  );
}

function GuardSnapshot({ guards: g, onOpenKill }: { guards: GuardData; onOpenKill: () => void }) {
  const rows = [
    { label: 'Kill switch', value: g.tradingEnabled ? 'ENABLED' : 'DISABLED', kind: g.tradingEnabled ? 'pos' : 'neg', icon: 'unlock' },
    { label: 'Circuit breaker', value: g.circuitBreakerTripped ? 'TRIPPED' : 'Standby', kind: g.circuitBreakerTripped ? 'neg' : 'muted', icon: 'shield' },
    { label: 'Daily DD', value: `${g.dailyDrawdownPct.toFixed(2)}% / ${g.dailyDrawdownLimit}%`, kind: 'muted', icon: 'down' },
    { label: 'Peak DD', value: `${g.peakDrawdownPct.toFixed(2)}% / ${g.peakDrawdownLimit}%`, kind: 'muted', icon: 'down' },
    { label: 'Consec losses', value: `${g.consecLosses} / ${g.consecLossesLimit}`, kind: 'muted', icon: 'minus' },
    { label: 'Orders / 10min', value: `${g.tradesLast10Min} / ${g.tradesLast10MinLimit}`, kind: 'muted', icon: 'zap' },
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
