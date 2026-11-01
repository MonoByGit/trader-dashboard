/** @jest-environment node */
// Dave repro PR 47 (v2 op a6fcc52): alpacaPaperBroker met gemockte Alpaca (geen netwerk). Asserties = gewenst gedrag.
// heldModel=true bootst Alpaca na: open sell orders reserveren stukken (held_for_orders); een sell boven qty-held geeft 403.
import { jest } from '@jest/globals';

type O = { id: string; client_order_id: string; symbol: string; side: string; qty: string; stop_price?: string; status: string; type: string };

async function load(open: O[], opts: { placeFails?: boolean; heldModel?: boolean; posQty?: Record<string, number> } = {}) {
  jest.resetModules();
  const placed: Array<Record<string, unknown>> = [];
  const cancelled: string[] = [];
  const all: O[] = [...open];
  const peak = { n: 0 };
  const isOpen = (o: O) => ['new', 'accepted', 'held', 'pending_new', 'partially_filled'].includes(o.status);
  const held = (sym: string) => all.filter((o) => isOpen(o) && o.side === 'sell' && o.symbol === sym).reduce((s, o) => s + Number(o.qty), 0);
  const alpaca = {
    openOrders: jest.fn(async () => all.filter(isOpen)),
    orders: jest.fn(async () => all),
    cancelOrder: jest.fn(async (id: string) => { cancelled.push(id); const o = all.find((x) => x.id === id); if (o) o.status = 'canceled'; }),
    getOrder: jest.fn(async (id: string) => all.find((x) => x.id === id) ?? { id, status: 'filled', filled_qty: '1', filled_avg_price: '100' }),
    getOrderByClientOrderId: jest.fn(async () => null),
    // Alpaca PATCH: nieuwe order, oude 'replaced'; niet in accepted/pending_*; reservering van de oude telt niet mee
    replaceOrder: jest.fn(async (id: string, r: Record<string, unknown>) => {
      const cur = all.find((x) => x.id === id);
      if (!cur || !isOpen(cur) || ['accepted', 'pending_new', 'pending_cancel', 'pending_replace'].includes(cur.status)) throw new Error('Alpaca PATCH x: 422 order not replaceable');
      if (r.client_order_id && all.some((x) => x.client_order_id === r.client_order_id)) throw new Error('Alpaca PATCH x: 422 client_order_id must be unique');
      const qty = r.qty != null ? Number(r.qty) : Number(cur.qty);
      if (opts.heldModel && qty > (opts.posQty?.[cur.symbol] ?? 0) - (held(cur.symbol) - Number(cur.qty)) + 1e-12) throw new Error('Alpaca PATCH x: 403 insufficient qty available');
      cur.status = 'replaced';
      const id2 = `r-${all.length}`;
      const next = { ...cur, id: id2, client_order_id: String(r.client_order_id ?? cur.client_order_id), qty: String(qty), stop_price: r.stop_price != null ? String(r.stop_price) : cur.stop_price, status: 'new' } as O;
      all.push(next);
      peak.n = Math.max(peak.n, all.filter((x) => isOpen(x) && x.side === 'sell' && x.type !== 'market').length);
      return next;
    }),
    positions: jest.fn(async () => Object.entries(opts.posQty ?? {}).map(([symbol, q]) => ({ symbol, qty: String(q), qty_available: String(q - held(symbol)) }))),
    placeOrder: jest.fn(async (o: Record<string, unknown>) => {
      if (opts.placeFails) throw new Error('Alpaca 403 insufficient qty available for order');
      if (all.some((x) => x.client_order_id === o.client_order_id)) throw new Error('Alpaca 422 client_order_id must be unique');
      if (opts.heldModel && o.side === 'sell') {
        const sym = String(o.symbol);
        const avail = (opts.posQty?.[sym] ?? 0) - held(sym);
        if (Number(o.qty) > avail + 1e-12) throw new Error(`Alpaca 403 insufficient qty available for order (requested: ${o.qty}, available: ${avail})`);
      }
      placed.push(o);
      const id = `id-${placed.length}`;
      const isStop = o.type !== 'market';
      all.push({ id, client_order_id: String(o.client_order_id), symbol: String(o.symbol), side: String(o.side), qty: String(o.qty), stop_price: o.stop_price != null ? String(o.stop_price) : undefined, status: isStop ? 'new' : 'filled', type: String(o.type), ...(isStop ? {} : { filled_qty: String(o.qty), filled_avg_price: '100' }) } as O);
      peak.n = Math.max(peak.n, all.filter((x) => isOpen(x) && x.side === 'sell' && x.type !== 'market').length);
      return { id, status: isStop ? 'new' : 'filled', filled_qty: String(o.qty), filled_avg_price: '100' };
    }),
  };
  jest.unstable_mockModule('@/lib/alpaca', () => ({ alpaca }));
  const { alpacaPaperBroker } = await import('@/lib/momentum2/broker');
  return { b: alpacaPaperBroker(), placed, cancelled, all, peak, open: () => all.filter(isOpen) };
}

const P5 = 'm5s-m5-nasdaq-trend-';

describe('PR47 alpacaPaperBroker', () => {
  it('K1 crypto marketorder gebruikt een TIF die Alpaca voor crypto accepteert (gtc/ioc, niet day)', async () => {
    const { b, placed } = await load([]);
    await b.marketOrder({ versionId: 'm6-btc-breakout', symbol: 'BTC/USD', side: 'buy', qty: 0.05, clientOrderId: 'm6-x' });
    expect(['gtc', 'ioc']).toContain(placed[0]!.time_in_force);
  });

  it('K2 qty-wijziging bij gelijke stopprijs krijgt een nieuwe, unieke client_order_id', async () => {
    const { b, open, all } = await load([{ id: 'a', client_order_id: `${P5}QLD-3500`, symbol: 'QLD', side: 'sell', qty: '10', stop_price: '35', status: 'new', type: 'stop' }]);
    await expect(b.setStop({ versionId: 'm5-nasdaq-trend', symbol: 'QLD', qty: 8, stopPrice: 35, stopClientPrefix: P5 })).resolves.toBeUndefined();
    const live = open();
    expect(live.map((o) => o.qty)).toEqual(['8']);
    expect(live[0]!.client_order_id).not.toBe(`${P5}QLD-3500`);
    expect(new Set(all.map((o) => o.client_order_id)).size).toBe(all.length);
  });

  it('K3 als het plaatsen van de nieuwe stop faalt, blijft er een stop staan', async () => {
    const { b, all } = await load([{ id: 'a', client_order_id: `${P5}QLD-3000`, symbol: 'QLD', side: 'sell', qty: '10', stop_price: '30', status: 'new', type: 'stop' }], { placeFails: true });
    await b.setStop({ versionId: 'm5-nasdaq-trend', symbol: 'QLD', qty: 10, stopPrice: 35, stopClientPrefix: P5 }).catch(() => {});
    expect(all.filter((o) => o.status === 'new').length).toBeGreaterThan(0);
  });

  it('K4 prefix-isolatie: listOpenStops/cancelStop raken geen M1-, m5- (markt), ander-versie- of m6s-orders', async () => {
    const foreign: O[] = [
      { id: 'm1', client_order_id: 'etf-eod-QLD-sell-restop', symbol: 'QLD', side: 'sell', qty: '3', stop_price: '30', status: 'new', type: 'stop' },
      { id: 'mk', client_order_id: 'm5-m5-nasdaq-trend-2026-11-02-QLD-s', symbol: 'QLD', side: 'sell', qty: '3', status: 'new', type: 'market' },
      { id: 'tq', client_order_id: 'm5s-m5-nasdaq-tqqq-QLD-3000', symbol: 'QLD', side: 'sell', qty: '3', stop_price: '30', status: 'new', type: 'stop' },
      { id: 'm6', client_order_id: 'm6s-m6-btc-breakout-BTC/USD-5000000', symbol: 'BTC/USD', side: 'sell', qty: '0.1', stop_price: '50000', status: 'new', type: 'stop_limit' },
      { id: 'own', client_order_id: `${P5}QLD-3-3000-1`, symbol: 'QLD', side: 'sell', qty: '3', stop_price: '30', status: 'new', type: 'stop' },
    ];
    const { b, cancelled } = await load(foreign);
    const listed = await b.listOpenStops({ stopClientPrefix: P5 });
    expect(listed.map((x) => x.clientOrderId)).toEqual([`${P5}QLD-3-3000-1`]);
    await b.cancelStop({ versionId: 'm5-nasdaq-trend', symbol: 'QLD', stopClientPrefix: P5 });
    expect(cancelled).toEqual(['own']);
  });

  it('K5 crypto stop is stop_limit gtc met limit 0,995 x stop (geen bescherming bij gap onder de limit)', async () => {
    const { b, placed } = await load([]);
    await b.setStop({ versionId: 'm6-btc-breakout', symbol: 'BTC/USD', qty: 0.05, stopPrice: 50000, stopClientPrefix: 'm6s-m6-btc-breakout-' });
    expect(placed[0]).toMatchObject({ type: 'stop_limit', time_in_force: 'gtc', stop_price: 50000, limit_price: 49750 });
  });

  // ---- nieuw op a6fcc52, met Alpaca held_for_orders gedrag ----
  it('N2 stop verhogen (trailing) bij volle positie: plaats-dan-cancel moet slagen onder Alpaca reservering', async () => {
    const { b, open } = await load([{ id: 'a', client_order_id: `${P5}QLD-20-3000-1`, symbol: 'QLD', side: 'sell', qty: '20', stop_price: '30', status: 'new', type: 'stop' }], { heldModel: true, posQty: { QLD: 20 } });
    let err: unknown = null;
    await b.setStop({ versionId: 'm5-nasdaq-trend', symbol: 'QLD', qty: 20, stopPrice: 35, stopClientPrefix: P5 }).catch((e) => { err = e; });
    expect({ err: err ? String(err) : null, stops: open().map((o) => `${o.qty}@${o.stop_price}`) }).toEqual({ err: null, stops: ['20@35'] });
  });

  it('N2b positionQty geeft qty_available: met open stop 0 i.p.v. 20', async () => {
    const { b } = await load([{ id: 'a', client_order_id: `${P5}QLD-20-3000-1`, symbol: 'QLD', side: 'sell', qty: '20', stop_price: '30', status: 'new', type: 'stop' }], { heldModel: true, posQty: { QLD: 20 } });
    expect(await b.positionQty!({ symbol: 'QLD' })).toBe(20);
  });

  it('N5 plaats-dan-cancel: hoeveel eigen stops staan er even tegelijk open (positie 30, stop 10 -> 20)', async () => {
    const { b, open, peak } = await load([{ id: 'a', client_order_id: `${P5}QLD-10-3000-1`, symbol: 'QLD', side: 'sell', qty: '10', stop_price: '30', status: 'new', type: 'stop' }], { heldModel: true, posQty: { QLD: 30 } });
    await b.setStop({ versionId: 'm5-nasdaq-trend', symbol: 'QLD', qty: 20, stopPrice: 30, stopClientPrefix: P5 });
    expect({ eindOpen: open().length, piekTegelijk: peak.n }).toEqual({ eindOpen: 1, piekTegelijk: 1 });
  });
});
