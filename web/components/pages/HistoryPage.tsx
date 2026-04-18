'use client';
import { useState, useEffect } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { fmt } from '@/lib/format';
import { MOCK } from '@/lib/mock';

interface Trade {
  symbol: string; qty: number; entry: number; exit: number;
  pnl: number; pnlPct: number; reason: string; duration: string; closedAt: string;
}

interface AlpacaOrder {
  id: string; symbol: string; side: string; qty: number; filledQty: number;
  status: string; submittedAt: string; filledAt: string | null;
  filledAvgPrice: number | null; type: string;
}

export function HistoryPage() {
  const [liveOrders, setLiveOrders] = useState<AlpacaOrder[] | null>(null);

  useEffect(() => {
    fetch('/api/alpaca/orders')
      .then(r => r.json())
      .then((data: AlpacaOrder[]) => { setLiveOrders(Array.isArray(data) ? data : []); })
      .catch(() => setLiveOrders([]));
  }, []);

  if (liveOrders !== null) {
    return (
      <>
        <div className="page-head">
          <div><h1>Trade History</h1><div className="subtitle text-secondary">Live orders van Alpaca paper account. Echte uitvoeringen.</div></div>
        </div>
        <div className="card">
          <div className="card-head">
            <h3><Icon name="history" size={12}/> Orders <span className="text-tertiary mono" style={{fontSize:10}}>{liveOrders.length} total</span></h3>
          </div>
          <div className="card-body flush">
            <table className="data">
              <thead>
                <tr>
                  <th style={{width:140}}>Tijd</th>
                  <th style={{width:70}}>Sym</th>
                  <th style={{width:60}}>Side</th>
                  <th className="num" style={{width:60}}>Qty</th>
                  <th className="num">Prijs</th>
                  <th>Type</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {liveOrders.map(o => (
                  <tr key={o.id}>
                    <td className="mono text-tertiary" style={{fontSize:10}}>
                      {o.filledAt
                        ? new Date(o.filledAt).toLocaleString('nl-NL', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})
                        : new Date(o.submittedAt).toLocaleString('nl-NL', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}
                    </td>
                    <td className="sym">{o.symbol}</td>
                    <td><Pill kind={o.side==='buy'?'pos':'neg'}>{o.side.toUpperCase()}</Pill></td>
                    <td className="num mono">{o.filledQty || o.qty}</td>
                    <td className="num mono">{o.filledAvgPrice ? fmt.usd(o.filledAvgPrice) : <span className="text-tertiary">—</span>}</td>
                    <td className="text-tertiary" style={{fontSize:11}}>{o.type}</td>
                    <td><Pill kind={o.status==='filled'?'pos':o.status==='canceled'?'neg':'muted'}>{o.status}</Pill></td>
                  </tr>
                ))}
                {liveOrders.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{padding:48,textAlign:'center',color:'var(--text-tertiary)'}}>
                      <Icon name="history" size={32}/>
                      <div style={{marginTop:10,fontSize:12}}>Nog geen orders.</div>
                      <div style={{fontSize:11,marginTop:4}}>De agent plaatst zijn eerste order bij de market-open routine (09:35 ET).</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </>
    );
  }

  const h = MOCK.tradeHistory as Trade[];
  const wins = h.filter(t => t.pnl > 0), losses = h.filter(t => t.pnl < 0);
  const winRate = (wins.length / h.length * 100).toFixed(0);
  const totalPnl = h.reduce((s, t) => s + t.pnl, 0);
  const avgWin = wins.reduce((s, t) => s + t.pnl, 0) / (wins.length || 1);
  const avgLoss = losses.reduce((s, t) => s + t.pnl, 0) / (losses.length || 1);

  return (
    <>
      <div className="page-head"><div><h1>Trade History</h1><div className="subtitle text-secondary">Laden...</div></div></div>
      <div className="kpi-grid">
        <div className="kpi"><div className="kpi-label">Closed trades</div><div className="kpi-value">{h.length}</div><div className="kpi-delta neutral">Laden...</div></div>
        <div className="kpi"><div className="kpi-label">Win rate</div><div className="kpi-value">{winRate}%</div><div className="kpi-delta pos">{wins.length}W / {losses.length}L</div></div>
        <div className="kpi"><div className="kpi-label">Net P&L</div><div className="kpi-value" style={{color:totalPnl>=0?'var(--pos)':'var(--neg)'}}>{fmt.signedUsd(totalPnl)}</div><div className="kpi-delta neutral">Across all closed</div></div>
        <div className="kpi"><div className="kpi-label">Avg Win · Loss</div><div className="kpi-value" style={{fontSize:16}}><span className="text-pos">{fmt.signedUsd(avgWin)}</span> · <span className="text-neg">{fmt.signedUsd(avgLoss)}</span></div><div className="kpi-delta neutral">Per-trade mean</div></div>
      </div>
    </>
  );
}
