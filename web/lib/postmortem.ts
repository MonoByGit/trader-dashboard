import { alpacaSymbolsEqual } from '../../src/alpaca/symbol-path';
import { alpaca, AlpacaOrder } from './alpaca';
import { agentText } from './ai';
import { dbQuery, dbRun, hasDb, initDb } from './db';
import { ensureSchema } from './migrate';

export type CloseReason = 'stop' | 'take_profit' | 'eod' | 'manual' | 'unknown';

export type PostMortemInput = {
  symbol: string;
  qty: number;
  entryPrice: number;
  exitPrice: number;
  realizedPnl: number;
  closeReason: CloseReason;
  exitOrderId?: string;
  entryOrderId?: string;
};

async function findEntryDecision(symbol: string, entryOrderId?: string) {
  if (!hasDb()) return null;
  await initDb();
  if (entryOrderId) {
    const byOrder = await dbQuery<{
      id: string;
      rationale: string | null;
      agent_note: string | null;
      order_id: string | null;
    }>(`SELECT id, rationale, agent_note, order_id FROM decisions WHERE order_id = $1 LIMIT 1`, [entryOrderId]);
    if (byOrder[0]) return byOrder[0];
  }
  const recent = await dbQuery<{
    id: string;
    rationale: string | null;
    agent_note: string | null;
    order_id: string | null;
  }>(
    `SELECT id, rationale, agent_note, order_id FROM decisions
     WHERE symbol = $1 AND decision = 'BUY' AND routine = 'market-open'
     ORDER BY ts DESC LIMIT 5`,
    [symbol],
  );
  return recent[0] ?? null;
}

export async function createTradePostMortem(input: PostMortemInput): Promise<string | null> {
  if (!hasDb()) return null;
  await ensureSchema();
  await initDb();

  const dedupeKey = input.exitOrderId ? `pm:${input.exitOrderId}` : `pm:${input.symbol}:${input.exitPrice}:${Date.now()}`;
  const seen = await dbQuery(`SELECT 1 FROM settings WHERE key = $1`, [dedupeKey]);
  if (seen.length) return null;

  const entryDec = await findEntryDecision(input.symbol, input.entryOrderId);
  const entryRationale = [entryDec?.rationale, entryDec?.agent_note].filter(Boolean).join(' ') || 'Geen entry-beslissing gevonden.';

  let learnNote = '';
  try {
    learnNote = await agentText(
      `Je bent Momentum. Schrijf één alinea (max 4 zinnen) in het Nederlands: wat kunnen we leren van deze gesloten paper trade? Concreet en zonder em-dashes.`,
      `Symbol: ${input.symbol}\nEntry: $${input.entryPrice.toFixed(2)} → Exit: $${input.exitPrice.toFixed(2)}\nQty: ${input.qty}\nRealized P&L: $${input.realizedPnl.toFixed(2)}\nSluitreden: ${input.closeReason}\nReden entry: ${entryRationale}`,
      256,
      'fast',
    );
  } catch {
    learnNote = 'Post-mortem notitie kon niet worden gegenereerd.';
  }

  const id = `pm-${Date.now()}-${input.symbol}`;
  await dbRun(
    `INSERT INTO trade_post_mortems (
      id, symbol, qty, entry_price, exit_price, realized_pnl, close_reason,
      entry_decision_id, entry_rationale, learn_note, exit_order_id, closed_at, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())`,
    [
      id,
      input.symbol,
      input.qty,
      input.entryPrice,
      input.exitPrice,
      input.realizedPnl,
      input.closeReason,
      entryDec?.id ?? null,
      entryRationale,
      learnNote.trim(),
      input.exitOrderId ?? null,
    ],
  );
  await dbRun(`INSERT INTO settings (key, value) VALUES ($1, '1') ON CONFLICT (key) DO NOTHING`, [dedupeKey]);

  if (entryDec?.id) {
    const apps = await dbQuery<{ lesson_id: string }>(
      `SELECT DISTINCT lesson_id FROM lesson_applications WHERE decision_id = $1`,
      [entryDec.id],
    );
    const share = apps.length ? input.realizedPnl / apps.length : 0;
    await dbRun(
      `UPDATE lesson_applications SET trade_post_mortem_id = $1, pnl_impact = $2
       WHERE decision_id = $3 AND trade_post_mortem_id IS NULL`,
      [id, share, entryDec.id],
    );
    for (const a of apps) {
      await dbRun(
        `UPDATE lessons SET pnl_impact = COALESCE(pnl_impact, 0) + $1 WHERE id = $2`,
        [share, a.lesson_id],
      );
    }
  }

  return id;
}

function classifyCloseReason(order: AlpacaOrder): CloseReason {
  if (order.type === 'stop' || order.type === 'stop_limit' || order.stop_price) return 'stop';
  if (order.type === 'limit' && order.side === 'sell') return 'take_profit';
  return 'unknown';
}

/** Na een filled sell: post-mortem als we entry kunnen reconstrueren. */
export async function postMortemFromFilledSell(sellOrder: AlpacaOrder, closeReason?: CloseReason): Promise<void> {
  if (sellOrder.side !== 'sell' || sellOrder.status !== 'filled') return;
  const exit = parseFloat(sellOrder.filled_avg_price ?? '0');
  const qty = parseFloat(sellOrder.filled_qty ?? sellOrder.qty ?? '0');
  if (!exit || !qty) return;

  const orders = await alpaca.orders(100);
  const symbol = sellOrder.symbol;
  const buys = orders.filter(
    (o) =>
      alpacaSymbolsEqual(o.symbol, symbol) &&
      o.side === 'buy' &&
      o.status === 'filled' &&
      o.filled_at,
  );
  buys.sort((a, b) => (b.filled_at ?? '').localeCompare(a.filled_at ?? ''));
  const entryOrder = buys[0];
  const entry = entryOrder ? parseFloat(entryOrder.filled_avg_price ?? '0') : exit;
  const entryOrderId = entryOrder?.id;
  const realizedPnl = (exit - entry) * qty;

  await createTradePostMortem({
    symbol,
    qty,
    entryPrice: entry,
    exitPrice: exit,
    realizedPnl,
    closeReason: closeReason ?? classifyCloseReason(sellOrder),
    exitOrderId: sellOrder.id,
    entryOrderId,
  });
}

export async function postMortemFromEodClose(
  symbol: string,
  qty: number,
  entryPrice: number,
  exitPrice: number,
): Promise<void> {
  const realizedPnl = (exitPrice - entryPrice) * qty;
  await createTradePostMortem({
    symbol,
    qty,
    entryPrice,
    exitPrice,
    realizedPnl,
    closeReason: 'eod',
  });
}
