'use client';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { Toggle } from '@/components/ui/Toggle';
import { InfoTip } from '@/components/ui/Tooltip';
import { fmt } from '@/lib/format';
import { MOCK } from '@/lib/mock';

export function StrategyPage() {
  const c = MOCK.strategyConfig as Record<string, unknown>;
  const [holdOvernight, setHoldOvernight] = useState(c.hold_overnight as boolean);
  return (
    <>
      <div className="page-head"><div><h1>Strategy</h1><div className="subtitle text-secondary">Momentum Breakout · Version 1.0. Parameters via Railway env; deze UI is read-mostly.</div></div></div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3><Icon name="strategy" size={12}/> Entry Criteria (all 6 must pass)</h3></div>
          <div className="card-body">
            <Criterion num="1" label="Price > 20-day SMA" desc="Established short trend" tip="sma20"/>
            <Criterion num="2" label="Price > 50-day SMA" desc="Confirms longer uptrend" tip="sma50"/>
            <Criterion num="3" label="Price > 5-day high (close)" desc="Breakout trigger" tip="breakout"/>
            <Criterion num="4" label="Volume ≥ 1.1× 20-day avg" desc="Volume confirmation" tip="volume-ratio"/>
            <Criterion num="5" label="RSI(14) ∈ [50, 75]" desc="Momentum without overbought" tip="rsi"/>
            <Criterion num="6" label="No existing position" desc="One symbol, one position" tip="max-positions"/>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3><Icon name="diamond" size={12}/> Exit Ladder (first triggered wins)</h3></div>
          <div className="card-body">
            <ExitRule prio="1" label="Hard stop" val="−2% from entry" kind="neg" tip="hard-stop"/>
            <ExitRule prio="2" label="Trailing stop" val="−3% from high watermark" kind="warn" tip="trailing-stop"/>
            <ExitRule prio="3" label="Take profit" val="+5% from entry" kind="pos" tip="take-profit"/>
            <ExitRule prio="4" label="Trend break" val="Close below 20-day SMA" kind="muted" tip="sma20"/>
            <ExitRule prio="5" label="EOD close" val="16:10 ET — flatten all" kind="muted" tip="eod-close"/>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3><Icon name="settings" size={12}/> Configuration</h3><Pill kind="muted">Env-managed</Pill></div>
        <div className="card-body">
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14}}>
            <ConfigCell k="max_positions" v={String(c.max_positions)}/>
            <ConfigCell k="position_size_pct" v={`${((c.position_size_pct as number)*100)}%`}/>
            <ConfigCell k="hard_stop_pct" v={`${((c.hard_stop_pct as number)*100)}%`}/>
            <ConfigCell k="trailing_stop_pct" v={`${((c.trailing_stop_pct as number)*100)}%`}/>
            <ConfigCell k="take_profit_pct" v={`${((c.take_profit_pct as number)*100)}%`}/>
            <ConfigCell k="vix_threshold" v={String(c.vix_threshold)}/>
            <ConfigCell k="breakout_chase_limit_pct" v={`${((c.breakout_chase_limit_pct as number)*100)}%`}/>
            <ConfigCell k="cash_floor_pct" v={`${((c.cash_floor_pct as number)*100)}%`}/>
            <div style={{padding:10,background:'var(--bg-app)',border:'1px solid var(--border-subtle)',borderRadius:6,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div>
                <div className="text-tertiary mono" style={{fontSize:10,textTransform:'uppercase',letterSpacing:0.05}}>hold_overnight</div>
                <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:4}}>{holdOvernight ? 'Enabled' : 'Disabled'}</div>
              </div>
              <Toggle on={holdOvernight} onChange={setHoldOvernight} aria-label="Hold overnight"/>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3><Icon name="eye" size={12}/> Approved Universe <InfoTip id="etf"/></h3><span className="text-tertiary mono" style={{fontSize:10}}>10 symbols · no exceptions</span></div>
        <div className="card-body" style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8}}>
          {(c.approvedSymbols as string[]).map(s => {
            const w = MOCK.watchlist.find(ww => ww.symbol === s);
            return (
              <div key={s} style={{padding:10,background:'var(--bg-app)',border:'1px solid var(--border-subtle)',borderRadius:6}}>
                <div className="sym" style={{fontSize:13}}>{s}</div>
                <div className="text-tertiary" style={{fontSize:10,marginTop:2}}>{w?.name}</div>
                <div className="mono" style={{fontSize:10,marginTop:6,color:'var(--text-secondary)'}}>{w ? fmt.usd(w.price) : '—'}</div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function Criterion({ num, label, desc, tip }: { num: string; label: string; desc: string; tip?: string }) {
  return (
    <div style={{display:'grid',gridTemplateColumns:'22px 1fr',gap:10,alignItems:'start',padding:'8px 0',borderBottom:'1px solid var(--border-subtle)'}}>
      <div style={{width:20,height:20,borderRadius:4,background:'var(--accent-dim)',color:'var(--accent)',display:'grid',placeItems:'center',fontSize:10,fontWeight:600,fontFamily:'var(--font-mono)'}}>{num}</div>
      <div><div style={{fontSize:11,fontWeight:500,display:'flex',alignItems:'center'}}>{label}{tip && <InfoTip id={tip}/>}</div><div className="text-tertiary" style={{fontSize:10,marginTop:2}}>{desc}</div></div>
    </div>
  );
}

function ExitRule({ prio, label, val, kind, tip }: { prio: string; label: string; val: string; kind: string; tip?: string }) {
  return (
    <div style={{display:'grid',gridTemplateColumns:'22px 1fr auto',gap:10,alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--border-subtle)'}}>
      <div style={{width:20,height:20,borderRadius:4,background:`var(--${kind==='muted'?'border-subtle':kind}-dim,var(--border-subtle))`,color:kind==='muted'?'var(--text-secondary)':`var(--${kind})`,display:'grid',placeItems:'center',fontSize:10,fontFamily:'var(--font-mono)',fontWeight:600}}>{prio}</div>
      <div><div style={{fontSize:11,fontWeight:500,display:'flex',alignItems:'center'}}>{label}{tip && <InfoTip id={tip}/>}</div><div className="text-tertiary mono" style={{fontSize:10,marginTop:2}}>{val}</div></div>
      <Pill kind={kind==='muted'?'muted':kind as 'pos'|'neg'|'warn'|'accent'|'muted'}>P{prio}</Pill>
    </div>
  );
}

function ConfigCell({ k, v }: { k: string; v: string }) {
  return (
    <div style={{padding:10,background:'var(--bg-app)',border:'1px solid var(--border-subtle)',borderRadius:6}}>
      <div className="text-tertiary mono" style={{fontSize:10,textTransform:'uppercase',letterSpacing:0.05}}>{k}</div>
      <div className="mono" style={{fontSize:14,marginTop:4,color:'var(--text-primary)'}}>{v}</div>
    </div>
  );
}
