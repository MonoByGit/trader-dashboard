'use client';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { fmt } from '@/lib/format';
import { MOCK } from '@/lib/mock';

interface ReportTrade { id: string; symbol: string; side: string; qty: number; entry: number; exit: number | null; pnl: number; r: number; note: string; }
interface Report {
  id: string; date: string; label: string; status: string; generatedAt: string;
  kpis: { sessionPnl: number; sessionPnlPct: number; equityStart: number; equityEnd: number; tradesOpened: number; tradesClosed: number; winRate: number; avgR: number; maxDrawdown: number; };
  summary: string;
  trades: ReportTrade[];
  lessonsApplied: { id: string; title: string; hits: number; outcome: string }[];
  lessonsLearned: { id: string; title: string; status: string; why: string }[];
  gates: { label: string; state: string; note: string }[];
  riskEvents: { time: string; text: string; kind: string }[];
}

export function ReportsPage() {
  const [selectedId, setSelectedId] = useState((MOCK.reports[0] as unknown as Report).id);
  const [showShare, setShowShare] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2400); };
  const R = (MOCK.reports as unknown as Report[]).find(r => r.id === selectedId);

  const handleExport = (format: string) => {
    if (!R) return;
    if (format === 'print') { window.print(); setShowShare(false); return; }
    const content = format === 'md' ? buildMarkdown(R) : JSON.stringify(R, null, 2);
    const mime = format === 'md' ? 'text/markdown' : 'application/json';
    const ext = format === 'md' ? 'md' : 'json';
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `report-${R.date}.${ext}`; a.click();
    URL.revokeObjectURL(url);
    setShowShare(false);
    showToast(`Rapport ${R.date} geëxporteerd als ${ext.toUpperCase()}.`);
  };

  return (
    <>
      <div className="page-head">
        <div><h1>Rapportages</h1><div className="subtitle text-secondary">Dagelijkse verhalen uit de agent — wat is er gebeurd, wat is geleerd, wat is geraakt.</div></div>
        <div className="page-head-right">
          <button className="btn outline" onClick={() => setShowShare(true)} disabled={!R}><Icon name="share" size={12}/> Delen / exporteren</button>
        </div>
      </div>

      <div className="reports-grid">
        <div className="reports-sidebar">
          <div className="reports-sidebar-head">
            <span style={{fontSize:10,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:0.06}}>Archief</span>
            <span className="text-tertiary mono" style={{fontSize:10}}>{MOCK.reports.length} rapporten</span>
          </div>
          <div className="reports-archive">
            {(MOCK.reports as unknown as Report[]).map(r => {
              const pos = r.kpis.sessionPnl >= 0;
              return (
                <div key={r.id} className={`report-entry${selectedId===r.id?' selected':''}`} onClick={() => setSelectedId(r.id)}>
                  <div className="report-entry-top">
                    <span className="mono text-tertiary" style={{fontSize:10}}>{r.date}</span>
                    <span className={`report-entry-pnl${pos?' pos':' neg'} mono`}>{fmt.signedUsd(r.kpis.sessionPnl, 0)}</span>
                  </div>
                  <div className="report-entry-label">{r.label.split(' ').slice(0,2).join(' ')}</div>
                  <div className="report-entry-meta">
                    <span>{r.kpis.tradesOpened + r.kpis.tradesClosed} trades</span>
                    {r.lessonsLearned.length > 0 && <span className="accent">+{r.lessonsLearned.length} lesson</span>}
                  </div>
                </div>
              );
            })}
            <div className="report-entry empty">
              <div className="text-tertiary" style={{fontSize:11,textAlign:'center',padding:18}}>
                <Icon name="clock" size={14}/><div style={{marginTop:6}}>Volgend rapport: vandaag 16:05 ET</div>
              </div>
            </div>
          </div>
        </div>

        <div className="report-detail">
          {R ? <ReportDetail R={R}/> : <div style={{padding:40,textAlign:'center',color:'var(--text-tertiary)'}}>Selecteer een rapport.</div>}
        </div>
      </div>

      {showShare && R && (
        <div className="modal-backdrop" onClick={() => setShowShare(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2><Icon name="share" size={12}/> Rapport delen</h2>
              <button className="icon-btn" onClick={() => setShowShare(false)} aria-label="Close"><Icon name="x" size={12}/></button>
            </div>
            <div className="modal-body">
              <p style={{fontSize:12,color:'var(--text-secondary)',marginTop:0,marginBottom:14}}>Rapport <span className="mono">{R.date}</span> — {R.label}</p>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
                <button className="export-choice" onClick={() => handleExport('md')}><div className="export-icon">MD</div><div><div style={{fontSize:12,fontWeight:500}}>Markdown</div><div style={{fontSize:10,color:'var(--text-tertiary)'}}>Voor Slack, Notion</div></div></button>
                <button className="export-choice" onClick={() => handleExport('json')}><div className="export-icon">{'{}'}</div><div><div style={{fontSize:12,fontWeight:500}}>JSON</div><div style={{fontSize:10,color:'var(--text-tertiary)'}}>Alle ruwe data</div></div></button>
                <button className="export-choice" onClick={() => handleExport('print')}><div className="export-icon">PDF</div><div><div style={{fontSize:12,fontWeight:500}}>Print / PDF</div><div style={{fontSize:10,color:'var(--text-tertiary)'}}>Print-dialog</div></div></button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

function ReportDetail({ R }: { R: Report }) {
  const pos = R.kpis.sessionPnl >= 0;
  const hasCloses = R.kpis.tradesClosed > 0;
  return (
    <div className="report-inner">
      <div className="report-header">
        <div>
          <div className="report-kicker">
            <span className="mono text-tertiary">{R.date}</span>
            <span className="text-tertiary">·</span>
            <span className="mono text-tertiary" style={{fontSize:10}}>Gegenereerd {fmt.relTime(R.generatedAt)}</span>
            <span className={`report-status-pill ${R.status}`}>{R.status==='final'?'Final':'Draft'}</span>
          </div>
          <h2 className="report-title">{R.label}</h2>
        </div>
        <div className="report-hero-pnl">
          <div className={`report-hero-v${pos?' pos':' neg'}`}>{fmt.signedUsd(R.kpis.sessionPnl)}</div>
          <div className="report-hero-sub">
            <span className={pos?'pos':'neg'}>{fmt.pct(R.kpis.sessionPnlPct)}</span>
            <span className="text-tertiary">· equity {fmt.usd(R.kpis.equityEnd, 0)}</span>
          </div>
        </div>
      </div>

      <div className="report-narrative">
        {R.summary.split('\n\n').map((para, i) => <p key={i}>{para}</p>)}
      </div>

      <div className="report-kpis">
        <div className="report-kpi"><div className="report-kpi-k">Equity start → eind</div><div className="report-kpi-v mono">{fmt.usd(R.kpis.equityStart,0)} → {fmt.usd(R.kpis.equityEnd,0)}</div></div>
        <div className="report-kpi">
          <div className="report-kpi-k">Trades</div>
          <div className="report-kpi-v mono">
            {R.kpis.tradesOpened>0&&<span>{R.kpis.tradesOpened} open</span>}
            {R.kpis.tradesOpened>0&&R.kpis.tradesClosed>0&&<span className="text-tertiary"> · </span>}
            {R.kpis.tradesClosed>0&&<span>{R.kpis.tradesClosed} closed</span>}
            {R.kpis.tradesOpened===0&&R.kpis.tradesClosed===0&&<span className="text-tertiary">—</span>}
          </div>
        </div>
        <div className="report-kpi"><div className="report-kpi-k">Win-rate</div><div className="report-kpi-v mono">{hasCloses?`${(R.kpis.winRate*100).toFixed(0)}%`:<span className="text-tertiary">—</span>}</div></div>
        <div className="report-kpi"><div className="report-kpi-k">Gem. R</div><div className="report-kpi-v mono" style={{color:hasCloses?(R.kpis.avgR>=0?'var(--pos)':'var(--neg)'):undefined}}>{hasCloses?`${R.kpis.avgR>0?'+':''}${R.kpis.avgR.toFixed(1)}R`:<span className="text-tertiary">—</span>}</div></div>
        <div className="report-kpi"><div className="report-kpi-k">Max drawdown</div><div className="report-kpi-v mono" style={{color:'var(--neg)'}}>{fmt.pct(R.kpis.maxDrawdown)}</div></div>
      </div>

      <div className="report-section">
        <div className="report-section-h"><Icon name="positions" size={11}/><span>Trades</span></div>
        <table className="report-trades">
          <thead><tr><th>ID</th><th>Sym</th><th className="num">Qty</th><th className="num">Entry</th><th className="num">Exit</th><th className="num">P&amp;L</th><th className="num">R</th><th>Note</th></tr></thead>
          <tbody>
            {R.trades.map(t => (
              <tr key={t.id}>
                <td className="mono text-tertiary" style={{fontSize:10}}>{t.id}</td>
                <td className="sym"><span style={{fontWeight:500}}>{t.symbol}</span><span className={`side-chip${t.side==='BUY'?' pos':' neg'}`}>{t.side}</span></td>
                <td className="num mono">{t.qty}</td>
                <td className="num mono">{fmt.usd(t.entry)}</td>
                <td className="num mono">{t.exit==null?<span className="text-tertiary">open</span>:fmt.usd(t.exit)}</td>
                <td className={`num mono${t.pnl>=0?' pos':' neg'}`}>{fmt.signedUsd(t.pnl)}</td>
                <td className={`num mono${t.r>=0?' pos':' neg'}`}>{t.r>0?'+':''}{t.r.toFixed(1)}R</td>
                <td className="text-secondary" style={{fontSize:11}}>{t.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {R.lessonsApplied.length > 0 && (
        <div className="report-section">
          <div className="report-section-h"><Icon name="check" size={11}/><span>Lessen die meeliepen als gate</span></div>
          <div className="lessons-applied-list">
            {R.lessonsApplied.map(l => (
              <div key={l.id} className="lesson-applied">
                <div className="lesson-applied-head"><span className="mono text-tertiary" style={{fontSize:10}}>{l.id}</span><span className="lesson-applied-title">{l.title}</span><span className="lesson-applied-hits mono">{l.hits}× geraakt</span></div>
                <div className="lesson-applied-outcome">→ {l.outcome}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {R.lessonsLearned.length > 0 && (
        <div className="report-section">
          <div className="report-section-h"><Icon name="sparkle" size={11}/><span>Nieuwe lessen uit deze dag</span></div>
          {R.lessonsLearned.map(l => (
            <div key={l.id} className="lesson-new-card">
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                <Pill kind="accent">{l.status==='proposed'?'Voorstel':'Actief'}</Pill>
                <span className="mono text-tertiary" style={{fontSize:10}}>{l.id}</span>
              </div>
              <div style={{fontSize:13,fontWeight:500,marginBottom:4}}>{l.title}</div>
              <div style={{fontSize:11,color:'var(--text-secondary)',lineHeight:1.5}}>{l.why}</div>
            </div>
          ))}
        </div>
      )}

      <div className="report-section">
        <div className="report-section-h"><Icon name="shield" size={11}/><span>Gate-status vandaag</span></div>
        <div className="gates-grid">
          {R.gates.map((g, i) => (
            <div key={i} className={`gate-cell ${g.state}`}>
              <div className="gate-cell-top"><span className="gate-cell-label">{g.label}</span><span className={`gate-cell-state ${g.state}`}>{g.state}</span></div>
              <div className="gate-cell-note text-tertiary">{g.note}</div>
            </div>
          ))}
        </div>
      </div>

      {R.riskEvents.length > 0 && (
        <div className="report-section">
          <div className="report-section-h"><Icon name="bolt" size={11}/><span>Risk events</span></div>
          <div className="risk-events">
            {R.riskEvents.map((e, i) => (
              <div key={i} className={`risk-event ${e.kind}`}>
                <span className="mono" style={{fontSize:10,color:'var(--text-tertiary)'}}>{e.time}</span>
                <span style={{fontSize:11,color:'var(--text-secondary)'}}>{e.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="report-footer">
        <Icon name="sparkle" size={10}/>
        <span>Automatisch gegenereerd door Momentum-1 op {fmt.time(R.generatedAt)} ET.</span>
      </div>
    </div>
  );
}

function buildMarkdown(R: Report) {
  let md = `# Trading report — ${R.label}\n\n`;
  md += `**Session P&L:** ${fmt.signedUsd(R.kpis.sessionPnl)} (${fmt.pct(R.kpis.sessionPnlPct)})  \n`;
  md += `**Equity:** ${fmt.usd(R.kpis.equityStart, 0)} → ${fmt.usd(R.kpis.equityEnd, 0)}\n\n`;
  md += `## Verhaal\n\n${R.summary}\n\n`;
  if (R.trades.length) {
    md += `## Trades\n\n| ID | Sym | Side | Qty | Entry | Exit | P&L | R |\n|---|---|---|---|---|---|---|---|\n`;
    R.trades.forEach(t => { md += `| ${t.id} | ${t.symbol} | ${t.side} | ${t.qty} | $${t.entry} | ${t.exit ?? 'open'} | ${fmt.signedUsd(t.pnl)} | ${t.r > 0 ? '+' : ''}${t.r.toFixed(1)}R |\n`; });
    md += '\n';
  }
  return md;
}
