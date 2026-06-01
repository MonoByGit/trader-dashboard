import { agentChat, type ChatMsg } from './ai';
import { dbQuery, dbRun, hasDb } from './db';
import { alpaca } from './alpaca';
import { ensureSchema } from './migrate';

// Een draad is tegelijk gesprek en taak. turn = wie aan zet is.
export type ThreadType = 'gesprek' | 'goedkeuring' | 'taak';
export type Turn = 'user' | 'agent' | 'none';
export type ThreadStatus = 'open' | 'done';
export type AnchorType = 'decision' | 'report' | 'lesson' | 'guard' | null;
export type BoardColumn = 'todo' | 'doing' | 'done';

export type ThreadDTO = {
  id: string;
  title: string;
  kind: string;
  type: ThreadType;
  status: ThreadStatus;
  turn: Turn;
  anchorType: AnchorType;
  anchorId: string | null;
  summary: string | null;
  assignee: string | null;
  dueDate: string | null;
  priority: string;
  tags: string[];
  unread: number;
  column: BoardColumn;
  createdAt: string;
  lastAt: string;
};

export type Message = { id: string; threadId: string; from: 'user' | 'agent'; body: string; createdAt: string };

type ThreadRow = {
  id: string; title: string; kind: string; type: string; status: string; turn: string;
  anchor_type: string | null; anchor_id: string | null; summary: string | null;
  assignee: string | null; due_date: string | null; priority: string; tags: string[] | null;
  unread: number; created_at: string; last_at: string;
};

// In-memory fallback (één proces) wanneer er geen database is.
type MemThread = ThreadRow & { messages: Message[] };
const mem: Record<string, MemThread> = {};

const SYSTEM = `Je bent Momentum, een autonome trading-agent die met Dusty samenwerkt. Je handelt een momentum-breakout-strategie op 10 Amerikaanse ETF's via Alpaca paper trading.

Stijl: helder, rustig, Nederlands. Geen jargon zonder uitleg. Je bent eerlijk over onzekerheid. Je legt je redenering uit in twee lagen: eerst de kern in mensentaal, dan optioneel de techniek. Geen em-dashes.

Je werkt samen met Dusty op een gedeeld bord. Elk gesprek hangt vaak aan een gebeurtenis (een order, een beslissing, een dagrapport of een lesvoorstel). Reageer op wat Dusty inbrengt, stel scherpe vragen terug waar nuttig, en wees concreet. Je hebt toegang tot de actuele rekening en posities.`;

function boardColumn(status: string, turn: string): BoardColumn {
  if (status === 'done') return 'done';
  if (turn === 'user') return 'todo';
  return 'doing';
}

function mapRow(r: ThreadRow): ThreadDTO {
  return {
    id: r.id,
    title: r.title,
    kind: r.kind || 'user_initiated',
    type: (r.type as ThreadType) || 'gesprek',
    status: (r.status === 'done' ? 'done' : 'open'),
    turn: (r.turn as Turn) || 'none',
    anchorType: (r.anchor_type as AnchorType) ?? null,
    anchorId: r.anchor_id ?? null,
    summary: r.summary ?? null,
    assignee: r.assignee ?? null,
    dueDate: r.due_date ?? null,
    priority: r.priority || 'normaal',
    tags: Array.isArray(r.tags) ? r.tags : [],
    unread: r.unread ?? 0,
    column: boardColumn(r.status, r.turn),
    createdAt: r.created_at,
    lastAt: r.last_at,
  };
}

export async function listThreads(): Promise<ThreadDTO[]> {
  await ensureSchema();
  if (hasDb()) {
    const rows = await dbQuery<ThreadRow>('SELECT * FROM threads ORDER BY last_at DESC LIMIT 200');
    return rows.map(mapRow);
  }
  if (Object.keys(mem).length === 0) seedDemoThreads();
  return Object.values(mem)
    .sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime())
    .map(mapRow);
}

// Zonder database (lokale preview) vullen we het bord met representatieve
// voorbeelddraden, zodat het samenwerkingsbord meteen te zien is. Antwoorden
// gaan wel echt naar Claude. In productie (met database) verschijnen hier de
// echte, door de bot aangemaakte draden in plaats hiervan.
function seedDemoThreads() {
  const mk = (minsAgo: number) => new Date(Date.now() - minsAgo * 60000).toISOString();
  const seed: Array<{ t: Omit<MemThread, 'messages'>; msgs: Array<{ from: 'user' | 'agent'; body: string; min: number }> }> = [
    {
      t: { id: 't-demo-1', title: 'Nieuwe positie: QQQ', kind: 'agent_initiated', type: 'gesprek', status: 'open', turn: 'user', anchor_type: 'decision', anchor_id: 'd-demo-qqq', summary: 'BUY 58 QQQ @ $441.82 · stop $432.98 · target $463.91', assignee: null, due_date: null, priority: 'normaal', tags: ['#qqq', '#positie'], unread: 1, created_at: mk(42), last_at: mk(42) },
      msgs: [{ from: 'agent', min: 42, body: 'Ik heb 58 QQQ gekocht rond $441.82. De breakout brak door de 5-day high met 1.12x volume.\n\nMijn harde stop ligt op $432.98 (-2%) en de take-profit op $463.91 (+5%). Wil je dat ik iets aan deze positie verander, of zal ik hem laten lopen?' }],
    },
    {
      t: { id: 't-demo-2', title: 'Lesvoorstel: Niet chasen boven 3%', kind: 'agent_initiated', type: 'goedkeuring', status: 'open', turn: 'user', anchor_type: 'lesson', anchor_id: 'lp-demo-1', summary: 'Skip de setup als prijs al 3%+ boven de breakout zit', assignee: null, due_date: null, priority: 'hoog', tags: ['#les', '#goedkeuring'], unread: 1, created_at: mk(120), last_at: mk(120) },
      msgs: [{ from: 'agent', min: 120, body: 'Ik wil een nieuwe les voorstellen:\n\nNiet chasen boven 3%\nAls de prijs al meer dan 3% boven de breakout-trigger staat, sla de setup over. Drie trades de laatste twee weken waren te laat binnen.\n\nWaarom: de data laat zien dat late entries gemiddeld -0.5R opleveren.\n\nGoedkeuren maakt dit een actieve regel in mijn strategie. Wil je dit goedkeuren, afwijzen, of er eerst over praten?' }],
    },
    {
      t: { id: 't-demo-3', title: 'Dagrapport vrijdag', kind: 'agent_initiated', type: 'gesprek', status: 'open', turn: 'agent', anchor_type: 'report', anchor_id: 'report-demo-1', summary: 'P&L +0.53% · 0 gesloten', assignee: null, due_date: null, priority: 'normaal', tags: ['#dagrapport'], unread: 0, created_at: mk(200), last_at: mk(8) },
      msgs: [
        { from: 'agent', min: 200, body: 'Rustige dag. QQQ en XLK in range gebleven, trailing stops aangetrokken. Resultaat vandaag: +0.53%. Wil je dat ik ergens dieper op inga?' },
        { from: 'user', min: 12, body: 'Waarom XLK nog niet in winst?' },
        { from: 'agent', min: 8, body: 'XLK ging iets te vroeg binnen op $238.44 en hangt nu net onder break-even. Nog ruim boven de harde stop ($233.67), dus binnen plan. Ik laat hem de ruimte; momentum is intact.' },
      ],
    },
    {
      t: { id: 't-demo-4', title: 'Semiconductors aan universe toevoegen', kind: 'user_initiated', type: 'taak', status: 'open', turn: 'agent', anchor_type: null, anchor_id: null, summary: 'SMH vs SOXX vergelijken, paper-test een week', assignee: 'claude', due_date: null, priority: 'normaal', tags: ['#universe', '#research'], unread: 0, created_at: mk(1440), last_at: mk(90) },
      msgs: [
        { from: 'user', min: 1440, body: 'Kun je SMH en SOXX vergelijken en eventueel toevoegen aan de universe?' },
        { from: 'agent', min: 90, body: 'Bezig. SMH toont sterker momentum maar hogere volatiliteit; SOXX is liquider voor onze ordersize. Ik paper-test beide een week parallel en kom vrijdag met een swap-voorstel.' },
      ],
    },
    {
      t: { id: 't-demo-5', title: 'Halve dag voor Goede Vrijdag', kind: 'agent_initiated', type: 'gesprek', status: 'done', turn: 'none', anchor_type: null, anchor_id: null, summary: 'Close-routine vervroegd naar 12:50', assignee: null, due_date: null, priority: 'normaal', tags: ['#calendar'], unread: 0, created_at: mk(4320), last_at: mk(2880) },
      msgs: [
        { from: 'agent', min: 4320, body: 'Donderdag is een halve dag (close 13:00 ET). Mijn standaard close om 16:10 zou te laat zijn. Vervroegen?' },
        { from: 'user', min: 4300, body: 'Ja, vervroeg de close. En check de market calendar voortaan automatisch.' },
        { from: 'agent', min: 2880, body: 'Geregeld. Market calendar check zit nu in de premarket-routine; halve dagen schuiven de close automatisch op.' },
      ],
    },
  ];
  for (const s of seed) {
    mem[s.t.id] = { ...s.t, messages: s.msgs.map((m, i) => ({ id: `${s.t.id}-m${i}`, threadId: s.t.id, from: m.from, body: m.body, createdAt: mk(m.min) })) };
  }
}

export async function getBoard(): Promise<{ todo: ThreadDTO[]; doing: ThreadDTO[]; done: ThreadDTO[]; counts: { todo: number; doing: number; done: number } }> {
  const all = await listThreads();
  const todo = all.filter((t) => t.column === 'todo');
  const doing = all.filter((t) => t.column === 'doing');
  const done = all.filter((t) => t.column === 'done').slice(0, 40);
  return { todo, doing, done, counts: { todo: todo.length, doing: doing.length, done: done.length } };
}

export async function getThread(id: string): Promise<{ thread: ThreadDTO | null; messages: Message[] }> {
  await ensureSchema();
  if (hasDb()) {
    const rows = await dbQuery<ThreadRow>('SELECT * FROM threads WHERE id=$1', [id]);
    if (rows.length === 0) return { thread: null, messages: [] };
    const msgs = await dbQuery<{ id: string; thread_id: string; from_role: string; body: string; created_at: string }>(
      'SELECT * FROM conversations WHERE thread_id=$1 ORDER BY created_at ASC',
      [id],
    );
    return {
      thread: mapRow(rows[0]),
      messages: msgs.map((m) => ({ id: m.id, threadId: m.thread_id, from: m.from_role as 'user' | 'agent', body: m.body, createdAt: m.created_at })),
    };
  }
  const t = mem[id];
  return { thread: t ? mapRow(t) : null, messages: t ? t.messages : [] };
}

type PatchFields = Partial<{ status: ThreadStatus; turn: Turn; assignee: string | null; dueDate: string | null; priority: string; read: boolean }>;

export async function patchThread(id: string, fields: PatchFields): Promise<ThreadDTO | null> {
  await ensureSchema();
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (fields.status !== undefined) { sets.push(`status=$${i++}`); vals.push(fields.status); }
  if (fields.turn !== undefined) { sets.push(`turn=$${i++}`); vals.push(fields.turn); }
  if (fields.assignee !== undefined) { sets.push(`assignee=$${i++}`); vals.push(fields.assignee); }
  if (fields.dueDate !== undefined) { sets.push(`due_date=$${i++}`); vals.push(fields.dueDate); }
  if (fields.priority !== undefined) { sets.push(`priority=$${i++}`); vals.push(fields.priority); }
  if (fields.read) { sets.push(`unread=0`); }
  if (sets.length === 0) { const g = await getThread(id); return g.thread; }
  sets.push('last_at=last_at');

  if (hasDb()) {
    vals.push(id);
    await dbRun(`UPDATE threads SET ${sets.join(', ')} WHERE id=$${i}`, vals);
    const g = await getThread(id);
    return g.thread;
  }
  const t = mem[id];
  if (!t) return null;
  if (fields.status !== undefined) t.status = fields.status;
  if (fields.turn !== undefined) t.turn = fields.turn;
  if (fields.assignee !== undefined) t.assignee = fields.assignee;
  if (fields.dueDate !== undefined) t.due_date = fields.dueDate;
  if (fields.priority !== undefined) t.priority = fields.priority;
  if (fields.read) t.unread = 0;
  return mapRow(t);
}

// Verankering: open een draad bij een gebeurtenis, of voeg toe als hij al bestaat
// voor dit anker. De agent doet iets -> draad gaat naar Dusty (turn=user).
export async function openOrAppendThread(p: {
  title: string;
  body: string;
  type?: ThreadType;
  anchorType?: AnchorType;
  anchorId?: string | null;
  summary?: string | null;
  tags?: string[];
  priority?: string;
}): Promise<string> {
  await ensureSchema();
  const now = new Date().toISOString();
  const type = p.type ?? 'gesprek';

  // Bestaat er al een draad voor dit anker?
  let existingId: string | null = null;
  if (p.anchorType && p.anchorId) {
    if (hasDb()) {
      const rows = await dbQuery<{ id: string }>('SELECT id FROM threads WHERE anchor_type=$1 AND anchor_id=$2 LIMIT 1', [p.anchorType, p.anchorId]);
      existingId = rows[0]?.id ?? null;
    } else {
      existingId = Object.values(mem).find((t) => t.anchor_type === p.anchorType && t.anchor_id === p.anchorId)?.id ?? null;
    }
  }

  if (existingId) {
    await appendMessage(existingId, 'agent', p.body);
    await bump(existingId, { turn: 'user', incUnread: true });
    return existingId;
  }

  const id = `t_${Date.now()}_${Math.floor(now.charCodeAt(now.length - 1))}`;
  const msg: Message = { id: `m_${Date.now()}_a`, threadId: id, from: 'agent', body: p.body, createdAt: now };

  if (hasDb()) {
    await dbRun(
      `INSERT INTO threads (id, title, kind, type, status, turn, anchor_type, anchor_id, summary, tags, priority, unread, created_at, last_at)
       VALUES ($1,$2,'agent_initiated',$3,'open','user',$4,$5,$6,$7,$8,1,NOW(),NOW())
       ON CONFLICT (id) DO NOTHING`,
      [id, p.title, type, p.anchorType ?? null, p.anchorId ?? null, p.summary ?? null, p.tags ?? [], p.priority ?? 'normaal'],
    );
    await dbRun('INSERT INTO conversations (id, thread_id, from_role, body, created_at) VALUES ($1,$2,$3,$4,$5)', [msg.id, id, 'agent', p.body, now]);
  } else {
    mem[id] = {
      id, title: p.title, kind: 'agent_initiated', type, status: 'open', turn: 'user',
      anchor_type: p.anchorType ?? null, anchor_id: p.anchorId ?? null, summary: p.summary ?? null,
      assignee: null, due_date: null, priority: p.priority ?? 'normaal', tags: p.tags ?? [], unread: 1,
      created_at: now, last_at: now, messages: [msg],
    };
  }
  return id;
}

async function appendMessage(threadId: string, from: 'user' | 'agent', body: string): Promise<Message> {
  const now = new Date().toISOString();
  const m: Message = { id: `m_${Date.now()}_${from[0]}`, threadId, from, body, createdAt: now };
  if (hasDb()) {
    await dbRun('INSERT INTO conversations (id, thread_id, from_role, body, created_at) VALUES ($1,$2,$3,$4,$5)', [m.id, threadId, from, body, now]);
  } else if (mem[threadId]) {
    mem[threadId].messages.push(m);
  }
  return m;
}

async function bump(threadId: string, opts: { turn?: Turn; incUnread?: boolean }) {
  const now = new Date().toISOString();
  if (hasDb()) {
    await dbRun(
      `UPDATE threads SET last_at=NOW()${opts.turn ? ', turn=$2' : ''}${opts.incUnread ? ', unread=unread+1' : ''} WHERE id=$1`,
      opts.turn ? [threadId, opts.turn] : [threadId],
    );
  } else if (mem[threadId]) {
    mem[threadId].last_at = now;
    if (opts.turn) mem[threadId].turn = opts.turn;
    if (opts.incUnread) mem[threadId].unread += 1;
  }
}

// Live Claude-antwoord binnen een draad. Hergebruikt door de chat-endpoint.
// Dusty stuurt iets -> agent antwoordt -> beurt terug naar Dusty.
export async function replyAsAgent(opts: { threadId: string; threadTitle?: string; message: string; type?: ThreadType }): Promise<{ reply: string; userMsg: Message; agentMsg: Message }> {
  await ensureSchema();
  const { threadId, message } = opts;
  const now = new Date().toISOString();

  const account = await alpaca.account().catch(() => null);
  const positions = await alpaca.positions().catch(() => [] as Awaited<ReturnType<typeof alpaca.positions>>);
  const equity = account ? `$${parseFloat(account.equity).toFixed(0)}` : 'onbekend';
  const cash = account ? `$${parseFloat(account.cash).toFixed(0)}` : 'onbekend';
  const posLine = positions.length
    ? positions.map((p) => `${p.symbol} (${parseFloat(p.unrealized_pl) >= 0 ? '+' : ''}$${parseFloat(p.unrealized_pl).toFixed(0)})`).join(', ')
    : 'geen';
  const ctx = `Actuele context:\n- Equity: ${equity}\n- Cash: ${cash}\n- Open posities: ${posLine}`;

  const existing = await getThread(threadId);
  const history = existing.messages;

  const messages: ChatMsg[] = [
    ...history.map((h): ChatMsg => ({ role: h.from === 'user' ? 'user' : 'assistant', content: h.body })),
    { role: 'user', content: message },
  ];

  let reply = '';
  try {
    reply = await agentChat(`${SYSTEM}\n\n${ctx}`, messages, 1024);
  } catch {
    reply = 'Sorry, ik kan nu even niet reageren. Probeer het zo opnieuw.';
  }

  // Draad borgen (aanmaken indien nieuw), dan beide berichten opslaan.
  if (hasDb()) {
    await dbRun(
      `INSERT INTO threads (id, title, kind, type, status, turn, last_at) VALUES ($1,$2,'user_initiated',$3,'open','agent',NOW())
       ON CONFLICT (id) DO UPDATE SET last_at=NOW()`,
      [threadId, opts.threadTitle || 'Gesprek', opts.type ?? 'gesprek'],
    );
  } else if (!mem[threadId]) {
    mem[threadId] = {
      id: threadId, title: opts.threadTitle || 'Gesprek', kind: 'user_initiated', type: opts.type ?? 'gesprek',
      status: 'open', turn: 'agent', anchor_type: null, anchor_id: null, summary: null, assignee: null,
      due_date: null, priority: 'normaal', tags: [], unread: 0, created_at: now, last_at: now, messages: [],
    };
  }

  const userMsg = await appendMessage(threadId, 'user', message);
  const agentMsg = await appendMessage(threadId, 'agent', reply);
  // Beurt terug naar Dusty; geen extra unread want Dusty is hier actief.
  await bump(threadId, { turn: 'user' });

  return { reply, userMsg, agentMsg };
}
