'use client';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { fmt } from '@/lib/format';

interface Position {
  symbol: string; name: string; sector: string;
  qty: number; avgEntryPrice: number; currentPrice: number;
  highWatermark: number; entryAt: string;
  stopLoss: number; trailingStop: number; takeProfit: number; sma20: number;
  marketValue: number; costBasis: number;
  unrealizedPnl: number; unrealizedPnlPct: number;
}

interface PositionsPageProps {
  portfolio: { positions: Position[] };
  mode: string;
  onClose: (p: Position) => void;
}

export function PositionsPage({ portfolio, onClose }: PositionsPageProps) {
  const [selected, setSelected] = useState(portfolio.positions[0]?.symbol || null);
  const sel = portfolio.positions.find(p => p.symbol === selected);

  if (portfolio.positions.length === 0) {
    return (
      <>
        <div className="page-head"><div><h1>Positions</h1><div className="subtitle text-secondary">Geen open posities. De market-open routine evalueert straks de watchlist.</div></div></div>
        <div className="card"><div className="card-body" style={{padding:48,textAlign:'center',color:'var(--text-tertiary)'}}>
          <Icon name="positions" size={40}/>
          <div style={{marginTop:12,fontSize:12}}>Flat. $100,000 cash, trading enabled.</div>
        </div></div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Positions</h1><div className="subtitle text-secondary">Per-positie stops, entries en exit-criteria. Klik een rij voor details.</div></div>
      </div>
      <div className="grid-2" style={{gridTemplateColumns:'1.2fr 1fr'}}>
        <div className="card">
          <div className="card-head"><h3><Icon name="positions" size={12}/> All Positions</h3></div>
          <div className="card-body flush">
            <table className="data">
              <thead><tr><th>Symbol</th><th className="num">Qty</th><th className="num">Entry</th><th className="num">Mark</th><th className="num">P&amp;L</th><th className="num">%</th></tr></thead>
              <tbody>
                {portfolio.positions.map(p => (
                  <tr key={p.symbol} className={`row-interactive${selected===p.symbol?' selected':''}`} onClick={() => setSelected(p.symbol)}>
                    <td><div className="sym">{p.symbol}</div><div className="text-tertiary" style={{fontSize:10}}>{p.name}</div></td>
                    <td className="num">{p.qty}</td>
                    <td className="num">{fmt.usd(p.avgEntryPrice)}</td>
                    <td className="num">{fmt.usd(p.currentPrice)}</td>
                    <td className="num" style={{color:p.unrealizedPnl>=0?'var(--pos)':'var(--neg)'}}>{fmt.signedUsd(p.unrealizedPnl)}</td>
                    <td className="num" style={{color:p.unrealizedPnl>=0?'var(--pos)':'var(--neg)'}}>{fmt.pct(p.unrealizedPnlPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {sel && <PositionDetailCard p={sel} onClose={onClose}/>}
      </div>
    </>
  );
}

function PositionDetailCard({ p, onClose }: { p: Position; onClose: (p: Position) => void }) {
  const items = [
    { k: 'Symbol', v: p.symbol, mono: true },
    { k: 'Sector', v: p.sector },
    { k: 'Quantity', v: String(p.qty), mono: true },
    { k: 'Entry', v: fmt.usd(p.avgEntryPrice), mono: true },
    { k: 'Entry time', v: fmt.timeS(p.entryAt), mono: true },
    { k: 'Mark', v: fmt.usd(p.currentPrice), mono: true },
    { k: 'High watermark', v: fmt.usd(p.highWatermark), mono: true },
    { k: 'Market value', v: fmt.usd(p.marketValue), mono: true },
    { k: 'Cost basis', v: fmt.usd(p.costBasis), mono: true },
    { k: 'Unrealized', v: `${fmt.signedUsd(p.unrealizedPnl)}  ·  ${fmt.pct(p.unrealizedPnlPct)}`, mono: true, color: p.unrealizedPnl>=0?'pos':'neg', wide: true }
  ];
  return (
    <div className="card">
      <div className="card-head">
        <h3>{p.symbol} · {p.name}</h3>
        <div className="right"><button className="btn danger" onClick={() => onClose(p)}><Icon name="x" size={12}/> Close position</button></div>
      </div>
      <div className="card-body">
        <div style={{fontSize:11,color:'var(--text-secondary)',marginBottom:12,padding:10,background:'var(--bg-app)',border:'1px solid var(--border-subtle)',borderRadius:6}}>
          <Icon name="bolt" size={11}/> Agent note: <span style={{color:'var(--text-primary)'}}>
            &quot;{p.symbol === 'QQQ' ? 'Breakout nam door met 1.12× volume. Ik heb 58 shares genomen op $441.82, trailing stop nu op $434.46.' : 'Even een dipje, maar nog $3.41 boven de hard stop. Ik hou \'m.'}&quot;
          </span>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}>
          {items.map((it, i) => (
            <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,padding:'6px 0',borderBottom:'1px solid var(--border-subtle)',gridColumn:it.wide?'1 / -1':'auto'}}>
              <span style={{fontSize:11,color:'var(--text-tertiary)',whiteSpace:'nowrap'}}>{it.k}</span>
              <span className={it.mono?'mono':''} style={{fontSize:11,color:it.color==='pos'?'var(--pos)':it.color==='neg'?'var(--neg)':'var(--text-primary)',whiteSpace:'nowrap',textAlign:'right'}}>{it.v}</span>
            </div>
          ))}
        </div>
        <div className="text-tertiary" style={{fontSize:10,textTransform:'uppercase',letterSpacing:0.05,marginBottom:8}}>Exit Ladder</div>
        <ExitLadder p={p}/>
      </div>
    </div>
  );
}

function ExitLadder({ p }: { p: Position }) {
  const levels = [
    { label: 'Take profit', price: p.takeProfit, kind: 'pos', dist: ((p.takeProfit - p.currentPrice) / p.currentPrice * 100) },
    { label: 'Current mark', price: p.currentPrice, kind: 'accent', dist: 0, current: true },
    { label: 'Trailing stop', price: p.trailingStop, kind: 'warn', dist: ((p.trailingStop - p.currentPrice) / p.currentPrice * 100) },
    { label: 'Hard stop', price: p.stopLoss, kind: 'neg', dist: ((p.stopLoss - p.currentPrice) / p.currentPrice * 100) },
    { label: '20-day SMA', price: p.sma20, kind: 'muted', dist: ((p.sma20 - p.currentPrice) / p.currentPrice * 100) }
  ].sort((a, b) => b.price - a.price);
  return (
    <div style={{display:'flex',flexDirection:'column',gap:4}}>
      {levels.map((l, i) => (
        <div key={i} style={{display:'grid',gridTemplateColumns:'110px 70px 1fr 56px',gap:8,alignItems:'center',padding:'6px 8px',background:l.current?'var(--accent-dim)':'transparent',borderRadius:4,border:l.current?'1px solid var(--accent)':'1px solid transparent'}}>
          <span style={{fontSize:11,color:l.current?'var(--accent)':'var(--text-secondary)'}}>{l.label}</span>
          <span className="mono" style={{fontSize:11,textAlign:'right'}}>{fmt.usd(l.price)}</span>
          <div style={{height:2,background:l.current?'var(--accent)':`var(--${l.kind==='muted'?'border-strong':l.kind})`,opacity:l.current?1:0.4}}/>
          <span className="mono" style={{fontSize:10,textAlign:'right',color:l.current?'var(--accent)':'var(--text-tertiary)'}}>{l.current?'—':fmt.pct(l.dist, 2)}</span>
        </div>
      ))}
    </div>
  );
}
