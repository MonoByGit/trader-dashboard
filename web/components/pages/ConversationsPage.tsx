'use client';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Segmented } from '@/components/ui/Segmented';
import { Modal } from '@/components/ui/Modal';
import { BrandLogo } from '@/components/ui/Icon';
import { fmt } from '@/lib/format';
import { MOCK } from '@/lib/mock';

interface Message { from: string; at: string; body: string; }
interface Thread {
  id: string; kind: string; title: string; tags: string[]; status: string;
  unread: number; createdAt: string; lastAt: string;
  context: { kind: string; id: string } | null;
  messages: Message[];
}

function relTime(iso: string) {
  const d = new Date(iso);
  const now = MOCK.now;
  const diffMin = Math.round((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `${diffD}d`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function dateLabel(iso: string) {
  const d = new Date(iso);
  const now = MOCK.now;
  const today = new Date(now); today.setHours(0,0,0,0);
  const dDay = new Date(d); dDay.setHours(0,0,0,0);
  const diffDays = Math.round((today.getTime() - dDay.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

async function fetchAgentReply(threadId: string, threadTitle: string, message: string): Promise<string> {
  try {
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId, threadTitle, message }),
    });
    const data = await res.json();
    return data.reply ?? 'Kon geen antwoord genereren. Probeer opnieuw.';
  } catch {
    return 'Verbindingsfout. Probeer opnieuw.';
  }
}

export function ConversationsPage() {
  const [threads, setThreads] = useState<Thread[]>(() => (MOCK.threads as Thread[]).map(t => ({ ...t, messages: [...t.messages] })));
  const [selectedId, setSelectedId] = useState<string>(threads[0]?.id || '');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterKind, setFilterKind] = useState('all');
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState('');
  const [composingNew, setComposingNew] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');

  const filtered = threads.filter(t => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (filterKind === 'user' && t.kind !== 'user_initiated') return false;
    if (filterKind === 'agent' && t.kind !== 'agent_initiated') return false;
    if (q) {
      const hay = (t.title + ' ' + t.messages.map(m => m.body).join(' ')).toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const selected = threads.find(t => t.id === selectedId) || null;
  const counts = {
    all: threads.length, open: threads.filter(t => t.status === 'open').length,
    closed: threads.filter(t => t.status === 'closed').length,
    agent: threads.filter(t => t.kind === 'agent_initiated').length,
    unread: threads.reduce((s, t) => s + (t.unread || 0), 0),
  };

  const [replying, setReplying] = useState(false);

  const sendReply = async () => {
    if (!draft.trim() || !selected || replying) return;
    const body = draft.trim();
    setThreads(ts => ts.map(t => t.id !== selected.id ? t : {
      ...t, lastAt: new Date().toISOString(), unread: 0,
      messages: [...t.messages, { from: 'user', at: new Date().toISOString(), body }],
    }));
    setDraft('');
    setReplying(true);
    const reply = await fetchAgentReply(selected.id, selected.title, body);
    setReplying(false);
    setThreads(ts => ts.map(t => t.id !== selected.id ? t : {
      ...t, lastAt: new Date().toISOString(),
      messages: [...t.messages, { from: 'agent', at: new Date().toISOString(), body: reply }],
    }));
  };

  const toggleClose = () => {
    if (!selected) return;
    setThreads(ts => ts.map(t => t.id === selected.id ? { ...t, status: t.status === 'open' ? 'closed' : 'open' } : t));
  };

  const markRead = (id: string) => setThreads(ts => ts.map(t => t.id === id ? { ...t, unread: 0 } : t));

  const startNew = () => {
    if (!newTitle.trim() || !newBody.trim()) return;
    const id = 't-' + String(threads.length + 1).padStart(3, '0');
    const t: Thread = {
      id, kind: 'user_initiated', title: newTitle.trim(), tags: [], status: 'open', unread: 0,
      createdAt: new Date().toISOString(), lastAt: new Date().toISOString(), context: null,
      messages: [{ from: 'user', at: new Date().toISOString(), body: newBody.trim() }]
    };
    setThreads(ts => [t, ...ts]);
    setSelectedId(id);
    setNewTitle(''); setNewBody('');
    setComposingNew(false);
    setTimeout(() => {
      setThreads(ts => ts.map(x => x.id === id ? { ...x, lastAt: new Date().toISOString(), messages: [...x.messages, { from: 'agent', at: new Date().toISOString(), body: 'Goede vraag. Laat me er even induiken. Ik kom terug met data.' }] } : x));
    }, 2200);
  };

  return (
    <div className="conv-wrap">
      <div className="page-head" style={{marginBottom:14}}>
        <div>
          <h1>Conversations</h1>
          <div className="subtitle text-secondary">Notities, vragen en onderzoek met de agent. Threads blijven bewaard en linken terug naar beslissingen.</div>
        </div>
        <div className="right">
          <button className="btn primary" onClick={() => setComposingNew(true)}><Icon name="plus" size={11}/> New thread</button>
        </div>
      </div>

      <div className="conv-grid">
        <div className="conv-inbox">
          <div className="conv-inbox-head">
            <div style={{position:'relative',marginBottom:8}}>
              <input className="input" placeholder="Search threads..." value={q} onChange={e => setQ(e.target.value)} style={{width:'100%',paddingLeft:26}}/>
              <div style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',pointerEvents:'none',color:'var(--text-tertiary)',display:'flex'}}><Icon name="search" size={11}/></div>
            </div>
            <Segmented value={filterStatus} onChange={setFilterStatus} options={[
              {label:`All ${counts.all}`,value:'all'},{label:`Open ${counts.open}`,value:'open'},{label:`Closed ${counts.closed}`,value:'closed'}
            ]}/>
            <div style={{display:'flex',gap:6,marginTop:8,fontSize:10}}>
              <button className={`chip-filter${filterKind==='all'?' on':''}`} onClick={() => setFilterKind('all')}>Any</button>
              <button className={`chip-filter${filterKind==='user'?' on':''}`} onClick={() => setFilterKind('user')}><Icon name="user" size={9}/> You started</button>
              <button className={`chip-filter${filterKind==='agent'?' on':''}`} onClick={() => setFilterKind('agent')}><Icon name="bolt" size={9}/> Agent started</button>
            </div>
          </div>
          <div className="conv-list">
            {filtered.map(t => (
              <div key={t.id}
                className={`conv-row${selectedId===t.id?' selected':''}${t.status==='closed'?' closed':''}`}
                onClick={() => { setSelectedId(t.id); markRead(t.id); }}>
                <div className="conv-row-top">
                  <div className="conv-kind-icon">
                    {t.kind==='agent_initiated'
                      ? <div className="conv-bubble agent"><Icon name="bolt" size={9}/></div>
                      : <div className="conv-bubble user">DM</div>}
                  </div>
                  <div className="conv-row-title-wrap">
                    <div className="conv-row-title">{t.title}</div>
                    <div className="conv-row-preview">{t.messages[t.messages.length-1]?.body.split('\n')[0]}</div>
                  </div>
                  <div className="conv-row-meta">
                    <span className="conv-time">{relTime(t.lastAt)}</span>
                    {t.unread > 0 && <span className="conv-unread">{t.unread}</span>}
                  </div>
                </div>
                <div className="conv-row-bottom">
                  {t.tags.map(tag => <span key={tag} className="conv-tag">{tag}</span>)}
                  {t.status==='closed' && <span className="conv-status-closed">Closed</span>}
                  {t.status==='open' && t.kind==='agent_initiated' && <span className="conv-status-await">Awaiting reply</span>}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{padding:32,textAlign:'center',color:'var(--text-tertiary)',fontSize:11}}>Geen threads in deze filter.</div>
            )}
          </div>
          <div className="conv-inbox-foot">
            <span>{counts.unread} unread</span><span className="text-tertiary">·</span><span>{counts.agent} agent-initiated</span>
          </div>
        </div>

        <div className="conv-detail">
          {selected ? (
            <>
              <div className="conv-detail-head">
                <div>
                  <div className="conv-detail-title">{selected.title}</div>
                  <div className="conv-detail-sub">
                    <span>{selected.kind==='agent_initiated'?'Agent started':'You started'}</span>
                    <span className="text-tertiary">·</span>
                    <span>{relTime(selected.createdAt)}</span>
                    <span className="text-tertiary">·</span>
                    <span>{selected.messages.length} message{selected.messages.length!==1?'s':''}</span>
                    {selected.tags.map(t => <span key={t} className="conv-tag">{t}</span>)}
                  </div>
                </div>
                <div className="right" style={{display:'flex',gap:6}}>
                  <button className="btn outline" onClick={toggleClose}>
                    <Icon name={selected.status==='open'?'check':'refresh'} size={11}/>
                    {selected.status==='open'?' Close':' Reopen'}
                  </button>
                  <button className="icon-btn" title="More" aria-label="More options"><Icon name="more" size={12}/></button>
                </div>
              </div>

              {selected.context && (
                <div className="conv-context">
                  <Icon name="bolt" size={11} className="text-accent"/>
                  <span className="text-secondary" style={{fontSize:11}}>Over:</span>
                  <span className="mono" style={{fontSize:11}}>{selected.context.kind} · {selected.context.id}</span>
                </div>
              )}

              <div className="conv-messages">
                {selected.messages.map((m, i) => {
                  const prev = selected.messages[i-1];
                  const showDate = !prev || dateLabel(m.at) !== dateLabel(prev.at);
                  return (
                    <div key={i}>
                      {showDate && <div className="conv-date-divider"><span>{dateLabel(m.at)}</span></div>}
                      <MessageBubble m={m}/>
                    </div>
                  );
                })}
                {selected.status==='closed' && (
                  <div className="conv-closed-banner"><Icon name="check" size={10}/> Thread closed. Reopen om verder te praten.</div>
                )}
              </div>

              {selected.status==='open' && (
                <div className="conv-composer">
                  <textarea
                    className="conv-textarea"
                    placeholder={selected.kind==='agent_initiated'?'Reageer op de agent...':'Type je bericht. ⌘Enter om te sturen.'}
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => { if (e.key==='Enter' && (e.metaKey||e.ctrlKey)) sendReply(); }}
                    rows={3}
                  />
                  <div className="conv-composer-foot">
                    <div className="conv-composer-tools">
                      <button className="icon-btn" title="Attach decision" aria-label="Attach decision"><Icon name="log" size={11}/></button>
                      <button className="icon-btn" title="Attach position" aria-label="Attach position"><Icon name="positions" size={11}/></button>
                    </div>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      <span className="text-tertiary" style={{fontSize:10}}>⌘ + Enter</span>
                      <button className="btn primary" onClick={sendReply} disabled={!draft.trim() || replying}><Icon name="send" size={11}/> {replying ? 'Denkt...' : 'Send'}</button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{display:'grid',placeItems:'center',height:'100%',color:'var(--text-tertiary)',fontSize:12}}>Selecteer een thread</div>
          )}
        </div>
      </div>

      <Modal open={composingNew} onClose={() => setComposingNew(false)}
        title="New thread"
        description="Stuur een vraag, observatie of notitie. De agent antwoordt en logt dit voor later."
        footer={<>
          <button className="btn ghost" onClick={() => setComposingNew(false)}>Cancel</button>
          <button className="btn primary" onClick={startNew} disabled={!newTitle.trim()||!newBody.trim()}><Icon name="send" size={11}/> Start thread</button>
        </>}>
        <div style={{display:'grid',gap:10}}>
          <div>
            <div className="text-tertiary" style={{fontSize:10,textTransform:'uppercase',letterSpacing:0.05,marginBottom:4}}>Title</div>
            <input className="input" placeholder="One-line summary..." value={newTitle} onChange={e => setNewTitle(e.target.value)} style={{width:'100%'}}/>
          </div>
          <div>
            <div className="text-tertiary" style={{fontSize:10,textTransform:'uppercase',letterSpacing:0.05,marginBottom:4}}>Message</div>
            <textarea className="conv-textarea" placeholder="What do you want to ask?" value={newBody} onChange={e => setNewBody(e.target.value)} rows={5} style={{width:'100%'}}/>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function MessageBubble({ m }: { m: Message }) {
  const mine = m.from === 'user';
  return (
    <div className={`msg${mine?' mine':' theirs'}`}>
      <div className="msg-avatar">
        {mine
          ? <div className="avatar-user">DM</div>
          : <div className="avatar-agent" style={{color:'#fff'}}><BrandLogo size={16}/></div>}
      </div>
      <div className="msg-body-wrap">
        <div className="msg-head">
          <span className="msg-name">{mine?'You':'Momentum-1'}</span>
          <span className="msg-time">{fmt.time(m.at)}</span>
        </div>
        <div className="msg-bubble">
          {m.body.split('\n').map((line, i) => <p key={i}>{line || '\u00A0'}</p>)}
        </div>
      </div>
    </div>
  );
}
