'use client';

import { useState } from 'react';
import { fmt } from '@/lib/format';
import { Sheet } from './Sheet';

type Trade = { id: string; symbol: string; side: string; qty: number; entry: number; exit: number | null; pnl: number; pnlPct: number; r: number | null; time: string; status: string; note?: string };
type Gate = { label: string; state: string; note: string };
type MReport = {
  id: string; date: string; label: string; status: string;
  kpis: { sessionPnl: number; sessionPnlPct: number; equityStart: number; equityEnd: number; tradesOpened: number; tradesClosed: number; winRate: number | null; avgR: number | null; maxDrawdown: number };
  summary: string; trades: Trade[]; gates: Gate[];
};

export function MobileReports({ reports }: { reports: MReport[] }) {
  const [sel, setSel] = useState<MReport | null>(null);
  if (!reports || reports.length === 0) {
    return <div className="m-empty">Nog geen rapporten. Het eerste verschijnt na de eerstvolgende EOD-routine.</div>;
  }
  return (
    <>
      {reports.map(r => {
        const pos = r.kpis.sessionPnl >= 0;
        return (
          <button key={r.id} className="m-row" style={{ flexDirection: 'column', alignItems: 'stretch' }} onClick={() => setSel(r)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="m-row-main">
                <div style={{ fontSize: 13, fontWeight: 600 }}>{r.label}</div>
                <div className="m-row-sub">{r.kpis.tradesOpened} open · {r.kpis.tradesClosed} gesloten · DD {r.kpis.maxDrawdown.toFixed(2)}%</div>
              </div>
              <div className="m-row-end">
                <span className={`big ${pos ? 'pos' : 'neg'}`}>{fmt.signedUsd(r.kpis.sessionPnl)}</span>
                <span className={`small ${pos ? 'pos' : 'neg'}`}>{fmt.pct(r.kpis.sessionPnlPct)}</span>
              </div>
            </div>
          </button>
        );
      })}

      <Sheet open={!!sel} title={sel?.label ?? ''} sub={sel ? `Sessierapport · ${sel.status}` : ''} onClose={() => setSel(null)}>
        {sel && (
          <>
            <div className="m-kpi-grid">
              <div className="m-kpi"><div className="k">Sessie P&amp;L</div><div className="v" style={{ color: sel.kpis.sessionPnl >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{fmt.signedUsd(sel.kpis.sessionPnl)}</div></div>
              <div className="m-kpi"><div className="k">Rendement</div><div className="v" style={{ color: sel.kpis.sessionPnl >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{fmt.pct(sel.kpis.sessionPnlPct)}</div></div>
              <div className="m-kpi"><div className="k">Equity eind</div><div className="v">{fmt.usd(sel.kpis.equityEnd, 0)}</div></div>
              <div className="m-kpi"><div className="k">Max drawdown</div><div className="v">{sel.kpis.maxDrawdown.toFixed(2)}%</div></div>
            </div>

            <div>
              <div className="m-card-title" style={{ marginBottom: 8 }}>Samenvatting</div>
              <p className="m-prose">{sel.summary}</p>
            </div>

            {sel.trades.length > 0 && (
              <div>
                <div className="m-card-title" style={{ marginBottom: 8 }}>Trades</div>
                {sel.trades.map(t => {
                  const pos = t.pnl >= 0;
                  return (
                    <div key={t.id} className="m-kv">
                      <span className="k"><span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{t.symbol}</span> · {t.side} {t.qty}</span>
                      <span className="v" style={{ color: pos ? 'var(--pos)' : 'var(--neg)' }}>{fmt.signedUsd(t.pnl)} {t.r != null && `· ${t.r > 0 ? '+' : ''}${t.r}R`}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {sel.gates.length > 0 && (
              <div>
                <div className="m-card-title" style={{ marginBottom: 8 }}>Gates</div>
                {sel.gates.map((g, i) => (
                  <div key={i} className="m-kv">
                    <span className="k">{g.label}</span>
                    <span className="v" style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text-tertiary)' }}>{g.note}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Sheet>
    </>
  );
}
