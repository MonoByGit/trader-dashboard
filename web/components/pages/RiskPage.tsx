'use client';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { InfoTip } from '@/components/ui/Tooltip';
import { fmt } from '@/lib/format';

interface Guards {
  tradingEnabled: boolean; circuitBreakerTripped: boolean; circuitBreakerReason?: string;
  dailyDrawdownPct: number; peakDrawdownPct: number;
  dailyDrawdownLimit: number; peakDrawdownLimit: number;
  consecLosses: number; consecLossesLimit: number;
  tradesLast10Min: number; tradesLast10MinLimit: number;
  openPositions: number; maxOpenPositions: number;
  dailyTrades: number; maxDailyTrades: number;
  cashReservePct: number; cashReserveMin: number;
  maxOrderSize: number; minOrderSize: number;
}

interface RiskPageProps {
  guards: Guards;
  onOpenKill: () => void;
  onResetBreaker: () => void;
}

export function RiskPage({ guards: g, onOpenKill, onResetBreaker }: RiskPageProps) {
  const barPct = (v: number, max: number) => Math.max(0, Math.min(100, (Math.abs(v) / Math.abs(max)) * 100));

  return (
    <>
      <div className="page-head"><div><h1>Risk &amp; Guards</h1><div className="subtitle text-secondary">Deze regels draaien buiten de LLM. Ze kunnen niet worden overruled tijdens runtime.</div></div></div>

      <div className="grid-2">
        <div className="card" style={{borderColor:g.tradingEnabled?'var(--border-subtle)':'var(--neg)'}}>
          <div className="card-head">
            <h3><Icon name={g.tradingEnabled?'unlock':'lock'} size={12}/> Kill Switch <InfoTip id="kill-switch"/></h3>
            <Pill kind={g.tradingEnabled?'pos':'neg'} dot pulse={g.tradingEnabled}>{g.tradingEnabled?'TRADING_ENABLED':'DISABLED'}</Pill>
          </div>
          <div className="card-body">
            <p className="text-secondary" style={{fontSize:11,margin:'0 0 14px',lineHeight:1.5}}>
              {g.tradingEnabled ? 'Alle orders worden verzonden na het doorlopen van de guards. Zet dit uit bij een flash crash, halt, of agent-misbehavior.' : 'Alle orderverzending is gestopt. Bestaande posities blijven beheerd (stops worden nog geëerbiedigd).'}
            </p>
            <button className="btn outline" onClick={onOpenKill} style={{width:'100%'}}>
              <Icon name={g.tradingEnabled?'lock':'unlock'} size={12}/>
              {g.tradingEnabled ? ' Disable trading' : ' Enable trading'}
            </button>
          </div>
        </div>
        <div className="card" style={{borderColor:g.circuitBreakerTripped?'var(--neg)':'var(--border-subtle)'}}>
          <div className="card-head">
            <h3><Icon name="shield" size={12}/> Circuit Breaker <InfoTip id="circuit-breaker"/></h3>
            <Pill kind={g.circuitBreakerTripped?'neg':'pos'} dot pulse={!g.circuitBreakerTripped}>{g.circuitBreakerTripped?'TRIPPED':'STANDBY'}</Pill>
          </div>
          <div className="card-body">
            <p className="text-secondary" style={{fontSize:11,margin:'0 0 14px',lineHeight:1.5}}>
              {g.circuitBreakerTripped ? `Gestopt: ${g.circuitBreakerReason}. Reset is handmatig en vereist menselijke review.` : 'Alle triggers zijn onder de drempelwaarde. Reset niet nodig.'}
            </p>
            <button className="btn outline" onClick={onResetBreaker} disabled={!g.circuitBreakerTripped} style={{width:'100%',opacity:g.circuitBreakerTripped?1:0.5}}>
              <Icon name="refresh" size={12}/> Manual reset
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3><Icon name="zap" size={12}/> Circuit Breaker Meters</h3></div>
        <div className="card-body">
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:18}}>
            {[
              {label:'Daily drawdown',v:g.dailyDrawdownPct,max:g.dailyDrawdownLimit,suffix:'%',tip:'daily-drawdown'},
              {label:'Peak drawdown',v:g.peakDrawdownPct,max:g.peakDrawdownLimit,suffix:'%',tip:'peak-drawdown'},
              {label:'Consecutive losses',v:g.consecLosses,max:g.consecLossesLimit,suffix:'',tip:'consec-losses'},
              {label:'Orders / 10 min window',v:g.tradesLast10Min,max:g.tradesLast10MinLimit,suffix:'',tip:'circuit-breaker'},
            ].map((m, i) => {
              const p = barPct(m.v, m.max);
              const col = p > 80 ? 'var(--neg)' : p > 50 ? 'var(--warn)' : 'var(--pos)';
              return (
                <div key={i}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:6}}>
                    <span className="text-secondary" style={{display:'inline-flex',alignItems:'center'}}>{m.label}<InfoTip id={m.tip}/></span>
                    <span className="mono"><span style={{color:col}}>{m.v}{m.suffix}</span> <span className="text-tertiary">/ {m.max}{m.suffix}</span></span>
                  </div>
                  <div style={{height:4,background:'var(--border-subtle)',borderRadius:2,overflow:'hidden'}}>
                    <div style={{width:`${p}%`,height:'100%',background:col}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3><Icon name="grid" size={12}/> Portfolio Limits</h3></div>
        <div className="card-body flush">
          <table className="data">
            <thead><tr><th>Guard</th><th className="num">Current</th><th className="num">Limit</th><th>Headroom</th><th>Status</th></tr></thead>
            <tbody>
              <tr><td>Max open positions</td><td className="num">{g.openPositions}</td><td className="num">{g.maxOpenPositions}</td><td><LimitBar v={g.openPositions} max={g.maxOpenPositions}/></td><td><Pill kind="pos">OK</Pill></td></tr>
              <tr><td>Daily trades</td><td className="num">{g.dailyTrades}</td><td className="num">{g.maxDailyTrades}</td><td><LimitBar v={g.dailyTrades} max={g.maxDailyTrades}/></td><td><Pill kind="pos">OK</Pill></td></tr>
              <tr><td><span style={{display:'inline-flex',alignItems:'center'}}>Cash reserve<InfoTip id="cash-floor"/></span></td><td className="num">{g.cashReservePct.toFixed(1)}%</td><td className="num">≥ {g.cashReserveMin}%</td><td><LimitBar v={g.cashReservePct} max={100} invert/></td><td><Pill kind="pos">OK</Pill></td></tr>
              <tr><td>Max single order</td><td className="num">$30,000</td><td className="num">{fmt.usd(g.maxOrderSize,0)}</td><td><LimitBar v={25} max={100}/></td><td><Pill kind="muted">Static</Pill></td></tr>
              <tr><td>Min order size</td><td className="num">$500</td><td className="num">{fmt.usd(g.minOrderSize,0)}</td><td><LimitBar v={100} max={100}/></td><td><Pill kind="muted">Static</Pill></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function LimitBar({ v, max, invert = false }: { v: number; max: number; invert?: boolean }) {
  const p = Math.max(0, Math.min(100, (v/max)*100));
  const col = invert ? (p < 20 ? 'var(--neg)' : 'var(--pos)') : (p > 80 ? 'var(--neg)' : p > 50 ? 'var(--warn)' : 'var(--pos)');
  return <div style={{width:120,height:4,background:'var(--border-subtle)',borderRadius:2}}><div style={{width:`${p}%`,height:'100%',background:col,borderRadius:2}}/></div>;
}
