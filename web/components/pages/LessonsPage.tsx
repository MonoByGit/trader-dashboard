'use client';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Toggle } from '@/components/ui/Toggle';
import { fmt } from '@/lib/format';
import { MOCK } from '@/lib/mock';

interface RelatedTrade { id: string; symbol: string; date: string; pnl: number; }
interface Lesson {
  id: string; title: string; description: string; category: string; status: string;
  source: string; confidence: number; createdAt: string; lastAppliedAt: string | null;
  hits: number; pnlImpact: number; pnlImpactSaved: boolean;
  trigger: { human: string; code: string; gateLabel: string };
  relatedTrades: RelatedTrade[];
}
interface Proposal {
  id: string; title: string; description: string; category: string; confidence: number;
  proposedAt: string; relatedTrades: RelatedTrade[];
  suggestedTrigger: { human: string; code: string };
}

const CAT_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  entry:      { color: 'var(--pos)',    bg: 'var(--pos-dim)',              label: 'Entry' },
  exit:       { color: 'var(--accent)', bg: 'var(--accent-dim)',           label: 'Exit' },
  risk:       { color: 'var(--warn)',   bg: 'var(--warn-dim)',             label: 'Risk' },
  psychology: { color: '#c77dff',       bg: 'rgba(199,125,255,0.14)',      label: 'Psychology' },
};
const CATEGORIES = [
  { id: 'all', label: 'All' }, { id: 'entry', label: 'Entry' }, { id: 'exit', label: 'Exit' },
  { id: 'risk', label: 'Risk' }, { id: 'psychology', label: 'Psychology' },
];

function relTime(iso: string) {
  if (!iso) return 'nog niet';
  const d = new Date(iso);
  const now = MOCK.now;
  const diff = Math.round((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.round(diff/60)}m ago`;
  if (diff < 86400) return `${Math.round(diff/3600)}h ago`;
  return `${Math.round(diff/86400)}d ago`;
}

export function LessonsPage() {
  const [lessons, setLessons] = useState<Lesson[]>(MOCK.lessons as Lesson[]);
  const [proposals, setProposals] = useState<Proposal[]>(MOCK.lessonProposals as Proposal[]);
  const [selectedId, setSelectedId] = useState<string>((MOCK.lessons[0] as Lesson).id);
  const [selectedProposal, setSelectedProposal] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2400); };

  const filtered = lessons.filter(L => {
    if (catFilter !== 'all' && L.category !== catFilter) return false;
    if (q && !(L.title + ' ' + L.description).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const selected = !selectedProposal ? lessons.find(L => L.id === selectedId) || null : null;
  const selectedProp = selectedProposal ? proposals.find(p => p.id === selectedProposal) || null : null;

  const toggleLesson = (id: string) => setLessons(ls => ls.map(L => L.id === id ? { ...L, status: L.status==='active'?'paused':'active' } : L));

  const approveProposal = (p: Proposal) => {
    const newLesson: Lesson = {
      id: 'L-' + String(lessons.length + 13).padStart(3, '0'),
      title: p.title, description: p.description, category: p.category,
      status: 'active', source: 'agent', confidence: p.confidence,
      createdAt: new Date().toISOString(), lastAppliedAt: null,
      hits: 0, pnlImpact: 0, pnlImpactSaved: true,
      trigger: { ...p.suggestedTrigger, gateLabel: p.title.split(' ').slice(0,2).join(' ') },
      relatedTrades: p.relatedTrades,
    };
    setLessons(ls => [newLesson, ...ls]);
    setProposals(ps => ps.filter(x => x.id !== p.id));
    setSelectedProposal(null);
    setSelectedId(newLesson.id);
    showToast(`Les "${p.title.slice(0,40)}..." goedgekeurd en actief.`);
  };
  const rejectProposal = (p: Proposal) => { setProposals(ps => ps.filter(x => x.id !== p.id)); setSelectedProposal(null); showToast('Voorstel afgewezen.'); };

  const counts = {
    active: lessons.filter(L => L.status==='active').length,
    totalImpact: lessons.filter(L => L.status==='active').reduce((s, L) => s + L.pnlImpact, 0),
    totalHits: lessons.filter(L => L.status==='active').reduce((s, L) => s + L.hits, 0),
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Lessons</h1>
          <div className="subtitle text-secondary">Regels die de agent uit ervaring heeft geleerd. Actieve lessen lopen mee als extra gate in het beslissingsproces.</div>
        </div>
      </div>

      <div className="lessons-stats">
        <div className="stat-cell"><div className="stat-k">Actief</div><div className="stat-v">{counts.active}</div><div className="stat-sub text-tertiary">/ {lessons.length} totaal</div></div>
        <div className="stat-cell"><div className="stat-k">Toegepast (30d)</div><div className="stat-v">{counts.totalHits}</div><div className="stat-sub text-tertiary">gate-checks geraakt</div></div>
        <div className="stat-cell"><div className="stat-k">Geschatte P&amp;L-impact</div><div className="stat-v pos">{fmt.signedUsd(counts.totalImpact)}</div><div className="stat-sub text-tertiary">bespaard + verdiend</div></div>
        <div className="stat-cell"><div className="stat-k">In review</div><div className="stat-v" style={{color:proposals.length?'var(--accent)':'var(--text-secondary)'}}>{proposals.length}</div><div className="stat-sub text-tertiary">agent-voorstellen</div></div>
      </div>

      {proposals.length > 0 && (
        <div className="proposals-banner">
          <div className="pb-head"><Icon name="bolt" size={12}/><strong>{proposals.length} nieuwe lessen voorgesteld door de agent</strong><span className="text-tertiary" style={{fontSize:11}}>— op basis van recente trades.</span></div>
          <div className="pb-list">
            {proposals.map(p => (
              <div key={p.id} className={`pb-card${selectedProposal===p.id?' selected':''}`} onClick={() => setSelectedProposal(p.id)}>
                <div className="pb-card-top">
                  <span className="cat-chip" style={{color:CAT_STYLE[p.category].color,background:CAT_STYLE[p.category].bg}}>{CAT_STYLE[p.category].label}</span>
                  <span className="text-tertiary mono" style={{fontSize:10}}>conf {(p.confidence*100).toFixed(0)}%</span>
                </div>
                <div className="pb-card-title">{p.title}</div>
                <div className="pb-card-meta"><Icon name="link" size={10}/> {p.relatedTrades.length} gerelateerde trades</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="lessons-grid">
        <div className="lessons-list-col">
          <div className="lessons-list-head">
            <div style={{position:'relative'}}>
              <input className="input" placeholder="Zoek in lessen..." value={q} onChange={e => setQ(e.target.value)} style={{width:'100%',paddingLeft:26}}/>
              <div style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',color:'var(--text-tertiary)',display:'flex',pointerEvents:'none'}}><Icon name="search" size={11}/></div>
            </div>
            <div style={{display:'flex',gap:4,marginTop:8,flexWrap:'wrap'}}>
              {CATEGORIES.map(c => (
                <button key={c.id} className={`chip-filter${catFilter===c.id?' on':''}`} onClick={() => setCatFilter(c.id)}>
                  {c.label} {c.id!=='all'&&<span className="text-tertiary" style={{marginLeft:3}}>{lessons.filter(L=>L.category===c.id).length}</span>}
                </button>
              ))}
            </div>
          </div>
          <div className="lessons-list">
            {filtered.length === 0
              ? <div style={{padding:32,textAlign:'center',color:'var(--text-tertiary)',fontSize:11}}>Geen lessen gevonden.</div>
              : filtered.map(L => {
                const s = CAT_STYLE[L.category];
                const isSel = !selectedProposal && selectedId === L.id;
                return (
                  <div key={L.id} className={`lesson-row${isSel?' selected':''}${L.status==='paused'?' paused':''}`} onClick={() => { setSelectedProposal(null); setSelectedId(L.id); }}>
                    <div className="lesson-row-top">
                      <span className="cat-chip" style={{color:s.color,background:s.bg}}>{s.label}</span>
                      <span className="lesson-row-id text-tertiary mono">{L.id}</span>
                    </div>
                    <div className="lesson-row-title">{L.title}</div>
                    <div className="lesson-row-meta">
                      <span><Icon name="check" size={10}/> {L.hits}</span>
                      <span style={{color:L.pnlImpact>0?'var(--pos)':L.pnlImpact<0?'var(--neg)':'var(--text-tertiary)'}} className="mono">{L.pnlImpact===0?'—':fmt.signedUsd(L.pnlImpact)}</span>
                      <span className="lesson-status"><span className={`dot-s${L.status==='active'?' on':' off'}`}/>{L.status==='active'?'active':'paused'}</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        <div className="lesson-detail">
          {selectedProp
            ? <ProposalDetail p={selectedProp} onApprove={() => approveProposal(selectedProp)} onReject={() => rejectProposal(selectedProp)}/>
            : selected
              ? <LessonDetail L={selected} onToggle={() => toggleLesson(selected.id)} relTime={relTime}/>
              : <div style={{padding:40,textAlign:'center',color:'var(--text-tertiary)'}}>Selecteer een les.</div>}
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

function LessonDetail({ L, onToggle, relTime }: { L: Lesson; onToggle: () => void; relTime: (s: string) => string }) {
  const s = CAT_STYLE[L.category];
  return (
    <div className="lesson-detail-inner">
      <div className="lesson-detail-head">
        <div style={{minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,flexWrap:'wrap'}}>
            <span className="cat-chip" style={{color:s.color,background:s.bg}}>{s.label}</span>
            <span className="mono text-tertiary" style={{fontSize:10}}>{L.id}</span>
            <span className="mono text-tertiary" style={{fontSize:10}}>· {L.source==='agent'?'🤖 geleerd door agent':'✏️ handmatig toegevoegd'}</span>
          </div>
          <h2 className="lesson-title">{L.title}</h2>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
          <span style={{fontSize:11,color:L.status==='active'?'var(--pos)':'var(--text-tertiary)'}}>{L.status==='active'?'Actief':'Paused'}</span>
          <Toggle on={L.status==='active'} onChange={onToggle} aria-label={`Toggle lesson ${L.id}`}/>
        </div>
      </div>

      <p className="lesson-desc">{L.description}</p>

      <div className="lesson-stats-grid">
        <div className="lesson-stat">
          <div className="lesson-stat-k">Confidence</div>
          <div className="lesson-stat-v">
            <div className="conf-bar"><div className="conf-bar-fill" style={{width:`${L.confidence*100}%`,background:L.confidence>0.8?'var(--pos)':L.confidence>0.6?'var(--accent)':'var(--warn)'}}/></div>
            <span className="mono">{(L.confidence*100).toFixed(0)}%</span>
          </div>
        </div>
        <div className="lesson-stat"><div className="lesson-stat-k">Toegepast</div><div className="lesson-stat-v"><span className="mono" style={{fontSize:14}}>{L.hits}</span><span className="text-tertiary" style={{fontSize:10}}>×</span></div></div>
        <div className="lesson-stat">
          <div className="lesson-stat-k">P&amp;L-impact</div>
          <div className="lesson-stat-v"><span className="mono" style={{fontSize:14,color:L.pnlImpact>0?'var(--pos)':L.pnlImpact<0?'var(--neg)':'var(--text-secondary)'}}>{L.pnlImpact===0?'—':fmt.signedUsd(L.pnlImpact)}</span>{L.pnlImpact!==0&&<span className="text-tertiary" style={{fontSize:10}}>{L.pnlImpactSaved?'bespaard':'verdiend'}</span>}</div>
        </div>
        <div className="lesson-stat"><div className="lesson-stat-k">Laatst geraakt</div><div className="lesson-stat-v"><span className="mono" style={{fontSize:11,color:'var(--text-secondary)'}}>{L.lastAppliedAt?relTime(L.lastAppliedAt):'nog niet'}</span></div></div>
      </div>

      <div className="lesson-section">
        <div className="lesson-section-h"><Icon name="bolt" size={11}/><span>Trigger-conditie</span><span className="text-tertiary" style={{fontSize:10,marginLeft:'auto'}}>Gate: <span className="mono" style={{color:'var(--text-secondary)'}}>{L.trigger.gateLabel}</span></span></div>
        <div className="lesson-trigger">
          <div className="trigger-human"><div className="trigger-label">Als</div><div className="trigger-expr">{L.trigger.human}</div></div>
          <div className="trigger-code mono"><span className="text-tertiary" style={{fontSize:10,marginRight:8}}>{'// '}</span>{L.trigger.code}</div>
        </div>
        <div className="lesson-gate-preview"><Icon name="check" size={10}/><span>Deze les loopt mee als gate in Decision Log — elke nieuwe entry wordt gecheckt.</span></div>
      </div>

      {L.relatedTrades.length > 0 && (
        <div className="lesson-section">
          <div className="lesson-section-h"><Icon name="link" size={11}/><span>Gerelateerde trades ({L.relatedTrades.length})</span></div>
          <table className="lesson-trades"><tbody>
            {L.relatedTrades.map(t => (
              <tr key={t.id}>
                <td className="mono text-tertiary" style={{fontSize:10}}>{t.id}</td>
                <td className="sym">{t.symbol}</td>
                <td className="mono text-tertiary">{t.date}</td>
                <td className="num mono" style={{color:t.pnl>=0?'var(--pos)':'var(--neg)'}}>{fmt.signedUsd(t.pnl)}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}

      <div className="lesson-foot">
        <button className="btn outline small"><Icon name="edit" size={11}/> Bewerken</button>
        <button className="btn outline small"><Icon name="copy" size={11}/> Dupliceren</button>
        <button className="btn outline small danger"><Icon name="trash" size={11}/> Verwijderen</button>
        <span style={{flex:1}}/>
        <span className="text-tertiary" style={{fontSize:10}}>Aangemaakt {relTime(L.createdAt)}</span>
      </div>
    </div>
  );
}

function ProposalDetail({ p, onApprove, onReject }: { p: Proposal; onApprove: () => void; onReject: () => void }) {
  const s = CAT_STYLE[p.category];
  return (
    <div className="lesson-detail-inner">
      <div className="proposal-banner"><Icon name="bolt" size={12}/><span><strong>Voorstel van de agent</strong> — goedkeuren activeert deze les als gate.</span></div>
      <div className="lesson-detail-head">
        <div>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
            <span className="cat-chip" style={{color:s.color,background:s.bg}}>{s.label}</span>
            <span className="mono text-tertiary" style={{fontSize:10}}>{p.id} · confidence {(p.confidence*100).toFixed(0)}%</span>
          </div>
          <h2 className="lesson-title">{p.title}</h2>
        </div>
      </div>
      <p className="lesson-desc">{p.description}</p>
      <div className="lesson-section">
        <div className="lesson-section-h"><Icon name="bolt" size={11}/><span>Voorgestelde trigger</span></div>
        <div className="lesson-trigger">
          <div className="trigger-human"><div className="trigger-label">Als</div><div className="trigger-expr">{p.suggestedTrigger.human}</div></div>
          <div className="trigger-code mono"><span className="text-tertiary" style={{fontSize:10,marginRight:8}}>{'// '}</span>{p.suggestedTrigger.code}</div>
        </div>
      </div>
      {p.relatedTrades.length > 0 && (
        <div className="lesson-section">
          <div className="lesson-section-h"><Icon name="link" size={11}/><span>Op basis van deze {p.relatedTrades.length} trades</span></div>
          <table className="lesson-trades"><tbody>
            {p.relatedTrades.map(t => (
              <tr key={t.id}><td className="mono text-tertiary" style={{fontSize:10}}>{t.id}</td><td className="sym">{t.symbol}</td><td className="mono text-tertiary">{t.date}</td><td className="num mono" style={{color:t.pnl>=0?'var(--pos)':'var(--neg)'}}>{fmt.signedUsd(t.pnl)}</td></tr>
            ))}
          </tbody></table>
        </div>
      )}
      <div className="lesson-foot">
        <button className="btn primary" onClick={onApprove}><Icon name="check" size={11}/> Goedkeuren &amp; activeren</button>
        <button className="btn outline" onClick={onReject}><Icon name="x" size={11}/> Afwijzen</button>
      </div>
    </div>
  );
}
