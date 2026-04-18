'use client';
import { useState, useEffect } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { Segmented } from '@/components/ui/Segmented';
import { fmt } from '@/lib/format';
import { MOCK } from '@/lib/mock';

interface Decision {
  id: string; symbol: string; decision: string; ts: string;
  agentNote?: string; rationale: string; criteria?: Record<string, string>;
  routine: string; orderId?: string;
}

interface DecisionLogPageProps {
  mode: string;
  onOpenDecision: (d: Decision) => void;
}

export function DecisionLogPage({ mode, onOpenDecision }: DecisionLogPageProps) {
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [liveDecisions, setLiveDecisions] = useState<Decision[] | null>(null);

  useEffect(() => {
    fetch('/api/decisions?limit=200')
      .then(r => r.json())
      .then((data: unknown) => {
        const arr = Array.isArray(data) ? data : [];
        if (arr.length > 0) {
          setLiveDecisions(arr.map((raw: unknown) => { const d = raw as Record<string, unknown>; return ({
            id: String(d.id ?? d.symbol ?? ''),
            symbol: String(d.symbol ?? ''),
            decision: String(d.decision ?? ''),
            ts: String(d.ts ?? d.created_at ?? new Date().toISOString()),
            agentNote: String(d.agent_note ?? d.agentNote ?? ''),
            rationale: String(d.rationale ?? ''),
            criteria: (d.criteria as Record<string, string>) ?? undefined,
            routine: String(d.routine ?? ''),
            orderId: d.order_id ? String(d.order_id) : undefined,
          }); }));
        }
      })
      .catch(() => null);
  }, []);

  const mockAll = (mode === 'empty'
    ? (MOCK.decisions as unknown as Decision[]).filter(d => d.routine === 'premarket')
    : MOCK.decisions as unknown as Decision[]);
  const all = liveDecisions ?? mockAll;
  const filtered = all.filter(d =>
    (filter === 'all' || d.decision === filter) &&
    (q === '' || d.symbol.toLowerCase().includes(q.toLowerCase()) || d.rationale.toLowerCase().includes(q.toLowerCase()))
  );
  const counts = {
    all: all.length,
    BUY: all.filter(d => d.decision === 'BUY').length,
    HOLD: all.filter(d => d.decision === 'HOLD').length,
    NO_GO: all.filter(d => d.decision === 'NO_GO').length,
  };

  return (
    <>
      <div className="page-head"><div><h1>Decision Log</h1><div className="subtitle text-secondary">Elke evaluatie die ik heb gedaan, met per-criterium pass/fail. Klik een regel voor volledige JSON.</div></div></div>
      <div className="card">
        <div className="card-head">
          <h3><Icon name="log" size={12}/> {filtered.length} entries <span className="text-tertiary mono" style={{fontSize:10}}>today</span></h3>
          <div className="right">
            <div style={{position:'relative'}}>
              <input className="input" placeholder="Search symbol or rationale..." value={q} onChange={e => setQ(e.target.value)} style={{width:240,paddingLeft:26}}/>
              <div style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',pointerEvents:'none',color:'var(--text-tertiary)',display:'flex'}}><Icon name="search" size={11}/></div>
            </div>
            <Segmented value={filter} onChange={setFilter} options={[
              {label:`All ${counts.all}`,value:'all'},
              {label:`BUY ${counts.BUY}`,value:'BUY'},
              {label:`HOLD ${counts.HOLD}`,value:'HOLD'},
              {label:`NO_GO ${counts.NO_GO}`,value:'NO_GO'},
            ]}/>
          </div>
        </div>
        <div className="card-body flush">
          <table className="data">
            <thead>
              <tr>
                <th style={{width:80}}>Time</th>
                <th style={{width:100}}>Routine</th>
                <th style={{width:70}}>Symbol</th>
                <th style={{width:90}}>Decision</th>
                <th>Criteria (6)</th>
                <th>Rationale</th>
                <th style={{width:30}}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => (
                <tr key={d.id} className="row-interactive" onClick={() => onOpenDecision(d)}>
                  <td className="mono" style={{fontSize:10,color:'var(--text-tertiary)'}}>{fmt.timeS(d.ts)}</td>
                  <td><Pill kind="muted">{d.routine}</Pill></td>
                  <td className="sym">{d.symbol}</td>
                  <td><Pill kind={d.decision==='BUY'?'pos':d.decision==='HOLD'?'accent':d.decision==='NO_GO'?'neg':'muted'}>{d.decision}</Pill></td>
                  <td>
                    {d.criteria
                      ? <div className="criteria">{Object.values(d.criteria).map((v,i) => <div key={i} className={`crit-dot ${v}`}/>)}</div>
                      : <span className="text-tertiary" style={{fontSize:10}}>—</span>}
                  </td>
                  <td className="text-secondary" style={{fontSize:11,maxWidth:420}}>{d.rationale}</td>
                  <td><Icon name="chevR" size={11}/></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{padding:32,textAlign:'center',color:'var(--text-tertiary)'}}>No entries match the filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
