import { NextResponse } from 'next/server';
import { alpaca } from '@/lib/alpaca';
import { claudeJson, claudeText, geminiText, MODELS } from '@/lib/ai';
import { dbQuery, dbRun, initDb, hasDb } from '@/lib/db';
import { sendMessage, buyMessage, stopHitMessage, eodDigestMessage } from '@/lib/telegram';
import { captureEvent } from '@/lib/openbrain';
import strategy from '@/strategy.json';

const WATCHLIST = strategy.symbols;

function requireAuth(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get('authorization') ?? '';
  return auth === `Bearer ${secret}`;
}

async function saveDecision(d: Record<string, unknown>) {
  const id = `d-${Date.now()}-${String(d.symbol)}`;
  if (!hasDb()) return;
  await initDb();
  await dbRun(
    `INSERT INTO decisions (id, ts, routine, symbol, decision, criteria, rationale, agent_note, confidence, order_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
    [id, new Date().toISOString(), d.routine, d.symbol, d.decision,
     JSON.stringify(d.criteria ?? null), d.rationale, d.agentNote, d.confidence, d.orderId ?? null]
  );
}

// Detect filled stop-loss legs today and ping Telegram once per order.
// Dedup uses the settings table (key = notified:<orderId>) so midday and eod
// never double-notify. Fully fail-safe.
async function notifyStopFills() {
  if (!hasDb()) return;
  try {
    await initDb();
    const orders = await alpaca.orders(50);
    const today = new Date().toISOString().split('T')[0];
    for (const o of orders) {
      if (o.side !== 'sell' || o.status !== 'filled' || !o.filled_at) continue;
      if (!o.filled_at.startsWith(today)) continue;
      const isStop = o.type === 'stop' || o.type === 'stop_limit' || !!o.stop_price;
      if (!isStop) continue;
      const key = `notified:${o.id}`;
      const seen = await dbQuery(`SELECT 1 FROM settings WHERE key=$1`, [key]);
      if (seen.length) continue;
      const exit = parseFloat(o.filled_avg_price ?? o.stop_price ?? '0');
      await sendMessage(stopHitMessage(o.symbol, exit));
      await dbRun(`INSERT INTO settings (key, value) VALUES ($1, '1') ON CONFLICT (key) DO NOTHING`, [key]);
    }
  } catch (e) {
    console.error('[notifyStopFills]', e);
  }
}

async function runPremarket() {
  const [barsData, account, positions, clock] = await Promise.all([
    alpaca.bars(WATCHLIST, '1Day', 30),
    alpaca.account(),
    alpaca.positions(),
    alpaca.clock(),
  ]);

  const bars = barsData.bars ?? {};
  const equity = parseFloat(account.equity);
  const openSymbols = positions.map(p => p.symbol);

  const snapshots = WATCHLIST.map(symbol => {
    const b = bars[symbol] ?? [];
    if (b.length < 5) return null;
    const closes = b.slice(-20).map((x: { c: number }) => x.c);
    const sma20 = closes.reduce((a: number, v: number) => a + v, 0) / closes.length;
    const last = closes[closes.length - 1];
    const vols = b.slice(-20).map((x: { v: number }) => x.v);
    const avgVol = vols.slice(0, -1).reduce((a: number, v: number) => a + v, 0) / (vols.length - 1);
    const gains: number[] = [], losses: number[] = [];
    for (let i = 1; i < Math.min(15, closes.length); i++) {
      const d = closes[i] - closes[i - 1];
      if (d >= 0) gains.push(d); else losses.push(-d);
    }
    const ag = gains.reduce((a, v) => a + v, 0) / 14;
    const al = losses.reduce((a, v) => a + v, 0) / 14;
    const rsi = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    return { symbol, lastClose: last, sma20: +sma20.toFixed(2), aboveSma20: last > sma20, rsi: +rsi.toFixed(1), volumeRatio: +(vols[vols.length - 1] / avgVol).toFixed(2) };
  }).filter(Boolean);

  let news = '{}';
  try {
    const r = await geminiText(MODELS.flash, `Today ${new Date().toISOString().split('T')[0]}. For ETFs ${WATCHLIST.join(',')}: any earnings risks or major negative news TODAY? JSON: {"QQQ":"safe/risky: reason",...}`);
    const m = r.match(/\{[\s\S]*\}/);
    if (m) news = m[0];
  } catch { news = '{}'; }

  const decisions = await claudeJson<Record<string, unknown>[]>(
    MODELS.sonnet,
    `Je bent Momentum-1. Strategie: ${strategy.name}. Equity: $${equity.toFixed(0)}. Open: ${openSymbols.join(',') || 'geen'}.
Criteria: trend_above_sma20, momentum_rsi(50-75), volume_above_avg(>1.1), vix_below_limit, no_earnings_risk, news_sentiment.
Max ${strategy.rules.max_positions} posities. Geen BUY voor al open symbolen.`,
    `Data:\n${JSON.stringify(snapshots)}\nNieuws:\n${news}\nGeef JSON array: [{"symbol":"QQQ","decision":"BUY"|"HOLD"|"NO_GO","criteria":{...pass/fail},"rationale":"2 zinnen","agentNote":"1 zin","confidence":0.0-1.0}]`,
    2048
  );

  for (const d of decisions) {
    await saveDecision({ routine: 'premarket', ...d });
  }

  return { routine: 'premarket', decisions, equity, openPositions: openSymbols, marketOpen: clock.is_open };
}

async function runMarketOpen() {
  // Kill switch check
  if (hasDb()) {
    await initDb();
    const rows = await dbQuery<{ value: string }>(`SELECT value FROM settings WHERE key='trading_enabled'`);
    if (rows.length > 0 && rows[0].value === 'false') {
      return { skipped: true, reason: 'Kill switch activated' };
    }
  }

  const [account, positions, clock] = await Promise.all([
    alpaca.account(),
    alpaca.positions(),
    alpaca.clock(),
  ]);

  if (!clock.is_open) return { skipped: true, reason: 'Market closed' };

  const equity = parseFloat(account.equity);
  const openSymbols = positions.map(p => p.symbol);
  if (openSymbols.length >= strategy.rules.max_positions) {
    return { skipped: true, reason: 'Max positions reached' };
  }

  const barsData = await alpaca.bars(WATCHLIST, '1Day', 30);
  const bars = barsData.bars ?? {};

  // Last known prices for server-side position sizing guard
  const lastPrices: Record<string, number> = {};
  for (const s of WATCHLIST) {
    const b = bars[s] ?? [];
    if (b.length > 0) lastPrices[s] = b[b.length - 1].c;
  }

  const candidates = await claudeJson<{ symbol: string; action: 'buy' | 'skip'; qty: number; reason: string }[]>(
    MODELS.sonnet,
    `Je bent Momentum-1. Bepaal entry orders. Equity: $${equity.toFixed(0)}. Al open: ${openSymbols.join(',') || 'geen'}. Max ${strategy.rules.max_positions} posities. Position size: ${strategy.rules.position_size_pct * 100}% equity. Cash floor: ${strategy.rules.cash_floor_pct * 100}%.`,
    `Bars data:\n${JSON.stringify(Object.fromEntries(WATCHLIST.map(s => [s, (bars[s] ?? []).slice(-5)])))}\nGeef JSON array van symbolen om te kopen: [{"symbol":"QQQ","action":"buy","qty":25,"reason":"reden"}]`,
    1024
  );

  const orders: { symbol: string; qty: number; orderId: string; stop?: number; takeProfit?: number }[] = [];
  for (const c of candidates) {
    if (c.action !== 'buy' || openSymbols.includes(c.symbol)) continue;
    if (openSymbols.length + orders.length >= strategy.rules.max_positions) break;

    // Server-side position size guard — cap Claude's qty recommendation
    const lastPrice = lastPrices[c.symbol];
    if (lastPrice) {
      const maxNotional = equity * strategy.rules.position_size_pct;
      const maxQty = Math.floor(maxNotional / lastPrice);
      c.qty = Math.max(1, Math.min(c.qty, maxQty));
    }

    // Broker-enforced hard stop (2%) and take profit (5%) via bracket order.
    // These fire at Alpaca even if no cron runs — the hard stop is never bypassable.
    const stopPrice = lastPrice ? +(lastPrice * (1 - strategy.rules.hard_stop_pct)).toFixed(2) : undefined;
    const takeProfitPrice = lastPrice ? +(lastPrice * (1 + strategy.rules.take_profit_pct)).toFixed(2) : undefined;

    try {
      const order = await alpaca.placeOrder(
        lastPrice
          ? {
              symbol: c.symbol, qty: c.qty, side: 'buy',
              type: 'market', time_in_force: 'day',
              order_class: 'bracket',
              stop_loss: { stop_price: stopPrice! },
              take_profit: { limit_price: takeProfitPrice! },
            }
          : { symbol: c.symbol, qty: c.qty, side: 'buy', type: 'market', time_in_force: 'day' }
      );
      orders.push({ symbol: c.symbol, qty: c.qty, orderId: order.id, stop: stopPrice, takeProfit: takeProfitPrice });
      await saveDecision({
        routine: 'market-open', symbol: c.symbol, decision: 'BUY', rationale: c.reason,
        agentNote: stopPrice ? `Bracket order: hard stop $${stopPrice}, take profit $${takeProfitPrice}. ${c.reason}` : c.reason,
        orderId: order.id, confidence: 0.8,
      });
      if (lastPrice) await sendMessage(buyMessage(c.symbol, c.qty, lastPrice, stopPrice!, takeProfitPrice!));
    } catch (e) {
      await saveDecision({ routine: 'market-open', symbol: c.symbol, decision: 'NO_GO', rationale: String(e), agentNote: 'Order mislukt.', confidence: 0 });
    }
  }
  return { routine: 'market-open', orders };
}

async function runMidday() {
  await notifyStopFills();
  const positions = await alpaca.positions();
  if (positions.length === 0) return { routine: 'midday', note: 'Geen posities.' };
  const notes = positions.map(p => `${p.symbol}: entry $${p.avg_entry_price}, now $${p.current_price}, P&L ${p.unrealized_pl}`);
  const note = await claudeText(MODELS.sonnet,
    `Je bent Momentum-1. Midday check. Geef een korte update (max 2 zinnen per positie) over de status van de stops en of actie nodig is. Schrijf in het Nederlands.`,
    notes.join('\n'), 512);
  for (const p of positions) {
    await saveDecision({ routine: 'midday', symbol: p.symbol, decision: 'HOLD', rationale: note, agentNote: `Stop: $${(parseFloat(p.current_price) * (1 - strategy.rules.trailing_stop_pct)).toFixed(2)}`, confidence: 0.9 });
  }
  return { routine: 'midday', positions: positions.length, note };
}

async function runEod() {
  await notifyStopFills();
  const positions = await alpaca.positions();
  const closed = [];
  for (const p of positions) {
    try {
      await alpaca.closePosition(p.symbol);
      closed.push(p.symbol);
      await saveDecision({ routine: 'eod', symbol: p.symbol, decision: 'CLOSE', rationale: 'EOD — geen overnight holding per strategie.', agentNote: `Gesloten op $${p.current_price}`, confidence: 1 });
    } catch { /* position may already be closed */ }
  }
  const account = await alpaca.account();
  const equity = parseFloat(account.equity);
  const lastEquity = parseFloat(account.last_equity);
  const report = await claudeText(MODELS.sonnet,
    'Je bent Momentum-1. Schrijf een EOD rapport in het Nederlands. Max 3 alinea\'s. Wat is er gebeurd, wat zijn de lessen, wat kijk ik naar morgen.',
    `Dag P&L: $${(equity - lastEquity).toFixed(2)} (${((equity - lastEquity) / lastEquity * 100).toFixed(2)}%). Equity: $${lastEquity.toFixed(0)} → $${equity.toFixed(0)}. Gesloten: ${closed.join(', ') || 'niets'}.`,
    1024);

  if (hasDb()) {
    await initDb();
    await dbRun(
      `INSERT INTO agent_reports (id, date, generated_at, kpis, narrative) VALUES ($1,NOW()::DATE,NOW(),$2,$3)`,
      [`report-${Date.now()}`, JSON.stringify({ equityStart: lastEquity, equityEnd: equity, closed }), report]
    );
  }

  // Daily Telegram digest.
  await sendMessage(eodDigestMessage(lastEquity, equity, closed, report));

  // Significant P&L event to Open Brain (drawdown or spike beyond 1.5%).
  const dayPct = lastEquity > 0 ? ((equity - lastEquity) / lastEquity) * 100 : 0;
  if (Math.abs(dayPct) >= 1.5) {
    await captureEvent(
      `Dag-P&L ${dayPct >= 0 ? '+' : ''}${dayPct.toFixed(2)}% ($${(equity - lastEquity).toFixed(2)}). Equity $${lastEquity.toFixed(0)} naar $${equity.toFixed(0)}. Gesloten: ${closed.join(', ') || 'niets'}.`
    );
  }

  return { routine: 'eod', closed, equity, report: report.slice(0, 200) };
}

export async function POST(req: Request) {
  if (!requireAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { routine } = await req.json();
  try {
    let result;
    switch (routine) {
      case 'premarket':    result = await runPremarket(); break;
      case 'market-open':  result = await runMarketOpen(); break;
      case 'midday':       result = await runMidday(); break;
      case 'eod':          result = await runEod(); break;
      case 'weekly': {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
        const r = await fetch(`${appUrl}/api/agent/review`, { method: 'POST' });
        result = await r.json();
        break;
      }
      default: return NextResponse.json({ error: 'Unknown routine' }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
