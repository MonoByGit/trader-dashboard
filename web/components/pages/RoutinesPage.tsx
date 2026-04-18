'use client';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { MOCK } from '@/lib/mock';

interface Routine { id: string; name: string; time: string; lastRun: string; summary: string; status: string; nextRun: string; }

const ROUTINE_MAP: Record<string, string> = {
  premarket: 'premarket',
  'market-open': 'market-open',
  midday: 'midday',
  close: 'eod',
  weekly: 'weekly',
};

async function triggerRoutine(routineId: string): Promise<{ ok: boolean; msg: string }> {
  const cronKey = ROUTINE_MAP[routineId] ?? routineId;
  try {
    const res = await fetch('/api/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routine: cronKey }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, msg: data.error ?? 'Mislukt' };
    return { ok: true, msg: `Routine "${cronKey}" voltooid.` };
  } catch (e) {
    return { ok: false, msg: String(e) };
  }
}

export function RoutinesPage({ onTrigger }: { onTrigger: (r: Routine) => void }) {
  const [running, setRunning] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ id: string; ok: boolean; msg: string } | null>(null);

  const handleRun = async (r: Routine) => {
    setRunning(r.id);
    setLastResult(null);
    const result = await triggerRoutine(r.id);
    setRunning(null);
    setLastResult({ id: r.id, ...result });
    if (result.ok) onTrigger(r);
  };

  return (
    <>
      <div className="page-head"><div><h1>Routines</h1><div className="subtitle text-secondary">Elke routine heeft een vast tijdslot en beperkte scope. Handmatig triggeren alleen voor tests.</div></div></div>
      <div className="card">
        <div className="card-head"><h3><Icon name="routines" size={12}/> Daily Schedule</h3></div>
        <div className="card-body flush">
          <table className="data">
            <thead><tr><th>Routine</th><th>Time</th><th>Last run</th><th>Summary</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {(MOCK.routines as Routine[]).map(r => (
                <tr key={r.id}>
                  <td><div style={{fontSize:12,fontWeight:500}}>{r.name}</div><div className="text-tertiary" style={{fontSize:10}}>/{r.id}</div></td>
                  <td className="mono">{r.time}</td>
                  <td className="mono text-secondary" style={{fontSize:10}}>{new Date(r.lastRun).toLocaleString('en-US',{month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})}</td>
                  <td className="text-secondary" style={{fontSize:11}}>{r.summary}</td>
                  <td>
                    {r.status==='done'&&<Pill kind="pos" dot>DONE</Pill>}
                    {r.status==='next'&&<Pill kind="accent" dot pulse>UP NEXT</Pill>}
                    {r.status==='scheduled'&&<Pill kind="muted">SCHEDULED</Pill>}
                    {running===r.id&&<Pill kind="accent" dot pulse>RUNNING</Pill>}
                    {lastResult?.id===r.id&&<Pill kind={lastResult.ok?'pos':'neg'}>{lastResult.ok?'✓ Klaar':'Fout'}</Pill>}
                  </td>
                  <td>
                    <button className="btn outline" disabled={running===r.id} onClick={() => handleRun(r)}>
                      <Icon name={running===r.id?'clock':'play'} size={10}/> {running===r.id?'Bezig...':'Run'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3><Icon name="routines" size={12}/> Market-Open Execution Order</h3></div>
          <div className="card-body">
            {['Check position count (skip to exits if 3 open)','Check market condition gates','For each symbol, evaluate all 6 entry criteria','Log decision for every symbol','Apply position sizing','Place orders'].map((s, i) => (
              <div key={i} style={{display:'grid',gridTemplateColumns:'24px 1fr',gap:10,padding:'8px 0',borderBottom:'1px solid var(--border-subtle)',alignItems:'center'}}>
                <div style={{width:20,height:20,borderRadius:10,background:'var(--accent-dim)',color:'var(--accent)',display:'grid',placeItems:'center',fontSize:10,fontWeight:600,fontFamily:'var(--font-mono)'}}>{i+1}</div>
                <div style={{fontSize:11}}>{s}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3><Icon name="clock" size={12}/> What cannot happen, by rule</h3></div>
          <div className="card-body">
            {['Partial entry (needs all 6)','Stop override after set','Chasing >3% above breakout','Off-list trading','Pre-close orders 15:40-16:00','Overnight holding (default)','Discretionary override of criteria'].map((s, i) => (
              <div key={i} style={{display:'flex',gap:10,padding:'8px 0',borderBottom:'1px solid var(--border-subtle)',alignItems:'center'}}>
                <Icon name="x" size={11} className="text-neg"/>
                <span style={{fontSize:11,color:'var(--text-secondary)'}}>{s}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
