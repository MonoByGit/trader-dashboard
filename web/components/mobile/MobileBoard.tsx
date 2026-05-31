'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { fmt } from '@/lib/format';
import { useSwipeBack } from './gestures';

// Veeg een kaart naar links om een snelactie te onthullen (iOS-stijl). Tik op
// de kaart opent 'm; een echte horizontale veeg onthult de actie en blokkeert
// de tik zodat ze elkaar niet bijten.
function SwipeRow({ children, actionLabel, actionKind = 'pos', onAction, onTap }: {
  children: React.ReactNode;
  actionLabel?: string;
  actionKind?: 'pos' | 'neg';
  onAction?: () => void;
  onTap: () => void;
}) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const REVEAL = 96;

  const onTouchStart = (e: React.TouchEvent) => {
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    moved.current = false;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!start.current || !actionLabel) return;
    const dX = e.touches[0].clientX - start.current.x;
    const dY = Math.abs(e.touches[0].clientY - start.current.y);
    if (Math.abs(dX) > 8 && Math.abs(dX) > dY) {
      moved.current = true;
      setDx(Math.max(-REVEAL - 20, Math.min(0, dX + (dx < 0 ? -REVEAL : 0) * 0 + (dx === -REVEAL ? -REVEAL : 0))));
      setDx(Math.max(-REVEAL - 16, Math.min(0, dX)));
    }
  };
  const onTouchEnd = () => {
    if (!actionLabel) { start.current = null; return; }
    setDx(dx < -REVEAL / 2 ? -REVEAL : 0);
    start.current = null;
  };

  return (
    <div className="m-swipe">
      {actionLabel && (
        <button className={`m-swipe-action ${actionKind}`} style={{ width: REVEAL }} onClick={() => { setDx(0); onAction?.(); }}>
          <Icon name="check" size={16} />{actionLabel}
        </button>
      )}
      <div
        className="m-swipe-face"
        style={{ transform: `translateX(${dx}px)`, transition: start.current ? 'none' : 'transform .22s cubic-bezier(0.2,0,0,1)' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={() => { if (moved.current || dx !== 0) { setDx(0); return; } onTap(); }}
      >
        {children}
      </div>
    </div>
  );
}

// Het samenwerkingsbord: elke draad is tegelijk gesprek en taak. turn = wie aan
// zet is. Kolommen: Te doen (jij aan zet) / Loopt / Afgerond.
type ThreadType = 'gesprek' | 'goedkeuring' | 'taak';
type Turn = 'user' | 'agent' | 'none';
type Column = 'todo' | 'doing' | 'done';
type Thread = {
  id: string; title: string; kind: string; type: ThreadType; status: 'open' | 'done'; turn: Turn;
  anchorType: 'decision' | 'report' | 'lesson' | 'guard' | null; anchorId: string | null;
  summary: string | null; assignee: string | null; dueDate: string | null; priority: string;
  tags: string[]; unread: number; column: Column; createdAt: string; lastAt: string;
};
type Message = { id: string; threadId: string; from: 'user' | 'agent'; body: string; createdAt: string };
type Board = { todo: Thread[]; doing: Thread[]; done: Thread[]; counts: { todo: number; doing: number; done: number } };

const COLS: { id: Column; label: string }[] = [
  { id: 'todo', label: 'Te doen' },
  { id: 'doing', label: 'Loopt' },
  { id: 'done', label: 'Afgerond' },
];

const typeMeta: Record<ThreadType, { icon: Parameters<typeof Icon>[0]['name']; label: string }> = {
  gesprek: { icon: 'chat', label: 'Gesprek' },
  goedkeuring: { icon: 'check', label: 'Goedkeuring' },
  taak: { icon: 'diamond', label: 'Taak' },
};

// Optimistisch: haal een draad uit todo/doing en tel 'm bij afgerond, zodat het
// bord direct reageert op de swipe-actie voordat de server bevestigt.
function pruneDone(b: Board, id: string): Board {
  const todo = b.todo.filter(t => t.id !== id);
  const doing = b.doing.filter(t => t.id !== id);
  return { todo, doing, done: b.done, counts: { todo: todo.length, doing: doing.length, done: b.counts.done + 1 } };
}

function turnPill(t: Thread) {
  if (t.status === 'done') return <Pill kind="muted" dot>Afgerond</Pill>;
  if (t.turn === 'user') return <Pill kind="warn" dot pulse>Jij aan zet</Pill>;
  if (t.turn === 'agent') return <Pill kind="accent" dot>Ik werk eraan</Pill>;
  return <Pill kind="muted">Open</Pill>;
}

export function MobileBoard({ onCounts }: { onCounts?: (todo: number) => void }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [col, setCol] = useState<Column>('todo');
  const [sel, setSel] = useState<Thread | null>(null);
  const [composing, setComposing] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/threads');
      const d: Board = await r.json();
      setBoard(d);
      onCounts?.(d.counts?.todo ?? 0);
    } catch { /* stil */ }
  }, [onCounts]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 25000);
    return () => clearInterval(iv);
  }, [load]);

  const list = board ? board[col] : [];

  // Snel afronden vanaf het bord (swipe-actie), zonder de draad te openen.
  const quickDone = async (id: string) => {
    setBoard(b => b ? pruneDone(b, id) : b);
    await fetch(`/api/threads/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done', turn: 'none', read: true }) }).catch(() => {});
    load();
  };

  return (
    <>
      <div className="m-board-head">
        <div className="m-seg">
          {COLS.map((c) => (
            <button key={c.id} className={`m-seg-btn${col === c.id ? ' active' : ''}`} onClick={() => setCol(c.id)}>
              {c.label}
              <span className="m-seg-count">{board?.counts?.[c.id] ?? 0}</span>
            </button>
          ))}
        </div>
        <button className="m-board-new" onClick={() => setComposing(true)} aria-label="Nieuw gesprek"><Icon name="plus" size={16} /></button>
      </div>

      {!board && <div className="m-empty">Bord laden…</div>}
      {board && list.length === 0 && (
        <div className="m-empty">
          {col === 'todo' ? 'Niets waar jij aan zet bent. Mooi.' : col === 'doing' ? 'Niets in behandeling.' : 'Nog niets afgerond.'}
        </div>
      )}

      {list.map((t) => (
        <SwipeRow
          key={t.id}
          onTap={() => setSel(t)}
          actionLabel={t.status !== 'done' ? 'Afronden' : undefined}
          actionKind="pos"
          onAction={() => quickDone(t.id)}
        >
          <div className="m-thread-card">
            <div className="m-thread-top">
              <span className={`m-type-chip ${t.type}`}><Icon name={typeMeta[t.type].icon} size={12} /> {typeMeta[t.type].label}</span>
              {t.priority === 'hoog' && t.status !== 'done' && <span className="m-prio">Hoog</span>}
              <span className="m-thread-time">{fmt.relTime(t.lastAt)}</span>
            </div>
            <div className="m-thread-title">{t.title}</div>
            {t.summary && <div className="m-thread-anchor"><Icon name="link" size={11} /> {t.summary}</div>}
            <div className="m-thread-foot">
              {turnPill(t)}
              {t.unread > 0 && <span className="m-badge hold">{t.unread}</span>}
              <span className="m-thread-tags">{t.tags.join(' ')}</span>
            </div>
          </div>
        </SwipeRow>
      ))}

      {sel && mounted && createPortal(
        <ThreadDetail thread={sel} onClose={() => { setSel(null); load(); }} onChanged={load} />,
        document.body,
      )}
      {composing && mounted && createPortal(
        <NewThread onClose={() => setComposing(false)} onCreated={(t) => { setComposing(false); load(); setSel(t); }} />,
        document.body,
      )}
    </>
  );
}

function ThreadDetail({ thread, onClose, onChanged }: { thread: Thread; onClose: () => void; onChanged: () => void }) {
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [t, setT] = useState<Thread>(thread);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refetch = useCallback(async () => {
    try {
      const r = await fetch(`/api/threads/${thread.id}`);
      if (!r.ok) return;
      const d = await r.json();
      if (d.thread) setT(d.thread);
      if (Array.isArray(d.messages)) setMsgs(d.messages);
    } catch { /* stil */ }
  }, [thread.id]);

  useEffect(() => {
    refetch();
    fetch(`/api/threads/${thread.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ read: true }) })
      .then(onChanged).catch(() => {});
  }, [thread.id, refetch, onChanged]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, sending]);

  const send = async () => {
    const message = input.trim();
    if (!message || sending) return;
    setInput('');
    setSending(true);
    setMsgs((m) => [...m, { id: `tmp-${Date.now()}`, threadId: t.id, from: 'user', body: message, createdAt: new Date().toISOString() }]);
    try {
      await fetch('/api/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ threadId: t.id, threadTitle: t.title, message, type: t.type }) });
      await refetch();
      onChanged();
    } catch { /* stil */ }
    setSending(false);
  };

  const close = async () => {
    setBusy('close');
    await fetch(`/api/threads/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done', turn: 'none' }) }).catch(() => {});
    setBusy(null);
    onChanged();
    onClose();
  };

  const decide = async (action: 'approve' | 'reject') => {
    if (!t.anchorId) return;
    setBusy(action);
    await fetch(`/api/lessons/proposals/${t.anchorId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) }).catch(() => {});
    setBusy(null);
    onChanged();
    onClose();
  };

  const isApproval = t.type === 'goedkeuring' && t.anchorType === 'lesson';
  const back = useSwipeBack(onClose);

  return (
    <div className="m-subview" onTouchStart={back.onTouchStart} onTouchEnd={back.onTouchEnd}>
      <div className="m-subhead">
        <button className="m-back" onClick={onClose}><span style={{ display: 'flex', transform: 'rotate(180deg)' }}><Icon name="chevR" size={14} /></span> Bord</button>
        <span className="m-subtitle">{typeMeta[t.type].label}</span>
      </div>

      <div className="m-scroll m-chat-scroll" ref={scrollRef}>
        <div className="m-thread-detail-head">
          <div className="m-thread-detail-title">{t.title}</div>
          {t.summary && <div className="m-thread-anchor"><Icon name="link" size={11} /> {t.summary}</div>}
          <div className="m-thread-foot" style={{ marginTop: 8 }}>{turnPill(t)}<span className="m-thread-tags">{t.tags.join(' ')}</span></div>
        </div>

        {msgs.map((m) => (
          <div key={m.id} className={`m-bubble ${m.from}`}>
            <div className="m-bubble-who">{m.from === 'user' ? 'Jij' : 'Agent'} · {fmt.relTime(m.createdAt)}</div>
            <div className="m-prose">{m.body}</div>
          </div>
        ))}
        {sending && <div className="m-bubble agent"><div className="m-bubble-who">Agent</div><div className="m-typing"><span /><span /><span /></div></div>}
      </div>

      <div className="m-composer-wrap">
        {t.status !== 'done' && isApproval && (
          <div className="m-action-row">
            <button className="m-btn success sm" disabled={!!busy} onClick={() => decide('approve')}><Icon name="check" size={14} /> Goedkeuren</button>
            <button className="m-btn danger sm" disabled={!!busy} onClick={() => decide('reject')}><Icon name="x" size={14} /> Afwijzen</button>
          </div>
        )}
        {t.status !== 'done' && !isApproval && (
          <div className="m-action-row">
            <button className="m-btn ghost sm" disabled={!!busy} onClick={close}>
              <Icon name="check" size={14} /> {t.type === 'taak' ? 'Markeer klaar' : 'Afronden'}
            </button>
          </div>
        )}
        <div className="m-composer">
          <textarea
            className="m-composer-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}
            placeholder="Schrijf een bericht…"
            rows={1}
          />
          <button className="m-send" disabled={!input.trim() || sending} onClick={send} aria-label="Versturen"><Icon name="send" size={16} /></button>
        </div>
      </div>
    </div>
  );
}

function NewThread({ onClose, onCreated }: { onClose: () => void; onCreated: (t: Thread) => void }) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const create = async () => {
    const msg = message.trim();
    if (!msg || sending) return;
    setSending(true);
    const id = `t_${Date.now()}`;
    const ttl = title.trim() || msg.slice(0, 48);
    try {
      await fetch('/api/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ threadId: id, threadTitle: ttl, message: msg, type: 'gesprek' }) });
    } catch { /* stil */ }
    setSending(false);
    onCreated({
      id, title: ttl, kind: 'user_initiated', type: 'gesprek', status: 'open', turn: 'user',
      anchorType: null, anchorId: null, summary: null, assignee: null, dueDate: null, priority: 'normaal',
      tags: [], unread: 0, column: 'todo', createdAt: new Date().toISOString(), lastAt: new Date().toISOString(),
    });
  };

  const back = useSwipeBack(onClose);

  return (
    <div className="m-subview" onTouchStart={back.onTouchStart} onTouchEnd={back.onTouchEnd}>
      <div className="m-subhead">
        <button className="m-back" onClick={onClose}><span style={{ display: 'flex', transform: 'rotate(180deg)' }}><Icon name="chevR" size={14} /></span> Bord</button>
        <span className="m-subtitle">Nieuw gesprek</span>
      </div>
      <div className="m-scroll" style={{ padding: 14, gap: 12, display: 'flex', flexDirection: 'column' }}>
        <input className="m-field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Onderwerp (optioneel)" />
        <textarea className="m-field" style={{ minHeight: 120, resize: 'none' }} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Wat wil je met de agent bespreken?" />
        <button className="m-btn success" disabled={!message.trim() || sending} onClick={create}>
          <Icon name="send" size={15} /> {sending ? 'Versturen…' : 'Start gesprek'}
        </button>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>Momentum antwoordt live met de actuele rekening- en positie-context.</div>
      </div>
    </div>
  );
}
