'use client';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { fmt } from '@/lib/format';
import { MOCK } from '@/lib/mock';

interface Trade {
  symbol: string; qty: number; entry: number; exit: number;
  pnl: number; pnlPct: number; reason: string; duration: string; closedAt: string;
}

export function HistoryPage() {
  const h = MOCK.tradeHistory as Trade[];
  const wins = h.filter(t => t.pnl > 0), losses = h.filter(t => t.pnl < 0);
  const winRate = (wins.length / h.length * 100).toFixed(0);
  const totalPnl = h.reduce((s, t) => s + t.pnl, 0);
  const avgWin = wins.reduce((s, t) => s + t.pnl, 0) / (wins.length || 1);
  const avgLoss = losses.reduce((s, t) => s + t.pnl, 0) / (losses.length || 1);

  return (
    <>
      <div className="page-head"><div><h1>Trade History</h1><div className="subtitle text-secondary">Gesloten posities, uitkomst, en gemiddelde houdduur. Laatste 8 trades.</div></div></div>
      <div className="kpi-grid">
        <div className="kpi"><div className="kpi-label">Closed trades</div><div className="kpi-value">{h.length}</div><div className="kpi-delta neutral">Last 7 trading days</div></div>
        <div className="kpi"><div className="kpi-label">Win rate</div><div className="kpi-value">{winRate}%</div><div className="kpi-delta pos">{wins.length}W <span className="text-tertiary">/</span> {losses.length}L</div></div>
        <div className="kpi"><div className="kpi-label">Net P&amp;L</div><div className="kpi-value" style={{color:totalPnl>=0?'var(--pos)':'var(--neg)'}}>{fmt.signedUsd(totalPnl)}</div><div className="kpi-delta neutral">Across all closed</div></div>
        <div className="kpi">
          <div className="kpi-label">Avg Win · Loss</div>
          <div className="kpi-value" style={{fontSize:16}}>
            <span className="text-pos">{fmt.signedUsd(avgWin)}</span> <span className="text-tertiary">·</span> <span className="text-neg">{fmt.signedUsd(avgLoss)}</span>
          </div>
          <div className="kpi-delta neutral">Per-trade mean</div>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h3><Icon name="history" size={12}/> All Closed Trades</h3></div>
        <div className="card-body flush">
          <table className="data">
            <thead>
              <tr>
                <th>Symbol</th><th className="num">Qty</th><th className="num">Entry</th><th className="num">Exit</th>
                <th className="num">P&amp;L</th><th className="num">%</th><th>Reason</th><th>Duration</th><th>Closed</th>
              </tr>
            </thead>
            <tbody>
              {h.map((t, i) => (
                <tr key={i} className="row-interactive">
                  <td className="sym">{t.symbol}</td>
                  <td className="num">{t.qty}</td>
                  <td className="num">{fmt.usd(t.entry)}</td>
                  <td className="num">{fmt.usd(t.exit)}</td>
                  <td className="num" style={{color:t.pnl>=0?'var(--pos)':'var(--neg)',fontWeight:500}}>{fmt.signedUsd(t.pnl)}</td>
                  <td className="num" style={{color:t.pnl>=0?'var(--pos)':'var(--neg)'}}>{fmt.pct(t.pnlPct)}</td>
                  <td><Pill kind={t.reason==='Hard stop'?'neg':t.reason==='Take profit'?'pos':t.reason==='Trailing stop'?'warn':'muted'}>{t.reason}</Pill></td>
                  <td className="mono text-secondary" style={{fontSize:11}}>{t.duration}</td>
                  <td className="mono text-tertiary" style={{fontSize:10}}>{new Date(t.closedAt).toLocaleString('en-US',{month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
