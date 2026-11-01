/** @jest-environment node */
// Dave repro PR 47 (v3 op 5a93422): executeDay + reconcile door de ECHTE makeAlpacaPaperBroker, met Daves eigen nep-Alpaca-client.
// Daves Alpaca-regels (bron: docs): positie account-breed; open sells reserveren (qty - filled); sell boven qty_available -> 403;
// client_order_id uniek -> 422; PATCH maakt nieuwe order, oude 'replaced', reservering van de oude telt niet; PATCH niet in
// accepted/pending_new/pending_cancel/pending_replace (422); cancel kan in pending_cancel blijven hangen (blijft reserveren);
// crypto-fee gaat van het ontvangen asset af (positie < filled_qty).
import { AlpacaHttpError } from '../../../../src/alpaca/alpaca-http-error';
import { makeAlpacaPaperBroker, type AlpacaOrderLike, type AlpacaPaperClient } from '../../../../src/momentum2/alpaca-paper-broker';
import { executeDay, type Store } from '../../../../src/momentum2/live';
import { reconcileDisasterStops } from '../../../../src/momentum2/reconcile-disaster-stops';
import { momentumStopClientPrefix } from '../../../../src/momentum2/order-tag';
import { newBook } from '../../../../src/momentum2/book';
import { makeBars } from '../../../../src/momentum2/fixtures';
import { m5Versions } from '../../../../src/momentum5/config';
import { m5Hooks } from '../../../../src/momentum5/plan';
import { m6Config } from '../../../../src/momentum6/config';
import { m6Hooks } from '../../../../src/momentum6/plan';
import type { OrderIntent, VersionBook } from '../../../../src/momentum2/types';

const [m5] = m5Versions(100_000);
const m6 = m6Config(100_000);
const r9 = (x: number) => Math.round(x * 1e9) / 1e9;
const OPENS = ['new', 'accepted', 'held', 'pending_new', 'partially_filled', 'pending_cancel', 'pending_replace'];

class DaveAlpaca implements AlpacaPaperClient {
  o: Array<AlpacaOrderLike & { cancelPolls?: number }> = [];
  pos: Record<string, number> = {};
  px: Record<string, number> = {};
  fee = 0; stopStatus = 'new'; cancelHangPolls = 0; getOrderFailsAfterPlace = 0; failStops = false; n = 0;
  held(sym: string, except?: string) { return r9(this.o.filter((x) => x.side === 'sell' && OPENS.includes(x.status) && x.symbol === sym && x.id !== except).reduce((s, x) => s + Number(x.qty) - Number(x.filled_qty), 0)); }
  avail(sym: string, except?: string) { return r9((this.pos[sym] ?? 0) - this.held(sym, except)); }
  e(m: 'POST' | 'PATCH' | 'DELETE' | 'GET', s: number, b: string): never { throw new AlpacaHttpError(m, 'https://paper-api.alpaca.markets/v2/orders', s, b); }
  fill(x: AlpacaOrderLike, q: number, p: number) {
    const f = r9(Number(x.filled_qty) + q);
    x.filled_avg_price = String(p); x.filled_qty = String(f); x.filled_at = '2024-06-03T15:00:00Z';
    x.status = f >= Number(x.qty) - 1e-12 ? 'filled' : 'partially_filled';
    const recv = x.side === 'buy' && x.symbol.includes('/') ? q * (1 - this.fee) : q;
    this.pos[x.symbol] = r9((this.pos[x.symbol] ?? 0) + (x.side === 'buy' ? recv : -q));
  }
  async placeOrder(r: Parameters<AlpacaPaperClient['placeOrder']>[0]) {
    if (r.type !== 'market' && this.failStops) this.e('POST', 500, 'x');
    if (this.o.some((x) => x.client_order_id === r.client_order_id)) this.e('POST', 422, 'client_order_id must be unique');
    if (r.side === 'sell' && r.qty > this.avail(r.symbol) + 1e-12) this.e('POST', 403, `insufficient qty available (requested ${r.qty}, available ${this.avail(r.symbol)})`);
    const x: AlpacaOrderLike = { id: `o${++this.n}`, client_order_id: r.client_order_id, symbol: r.symbol, side: r.side, qty: String(r.qty), filled_qty: '0', type: r.type, status: r.type === 'market' ? 'new' : this.stopStatus, filled_at: null, filled_avg_price: null, stop_price: r.stop_price != null ? String(r.stop_price) : null, limit_price: r.limit_price != null ? String(r.limit_price) : null };
    this.o.push(x);
    if (r.type === 'market') { this.fill(x, r.qty, this.px[r.symbol] ?? 100); if (this.getOrderFailsAfterPlace > 0) return { ...x, status: 'accepted', filled_qty: '0', filled_at: null, filled_avg_price: null }; }
    return { ...x };
  }
  async replaceOrder(id: string, r: Parameters<AlpacaPaperClient['replaceOrder']>[1]) {
    const cur = this.o.find((x) => x.id === id);
    if (!cur || !OPENS.includes(cur.status) || ['accepted', 'pending_new', 'pending_cancel', 'pending_replace'].includes(cur.status)) this.e('PATCH', 422, `order not replaceable (${cur?.status})`);
    if (this.failStops) this.e('PATCH', 500, 'x');
    const qty = r.qty ?? Number(cur!.qty);
    if (qty > this.avail(cur!.symbol, cur!.id) + 1e-12) this.e('PATCH', 403, 'insufficient qty available');
    if (r.client_order_id && this.o.some((x) => x.client_order_id === r.client_order_id)) this.e('PATCH', 422, 'client_order_id must be unique');
    cur!.status = 'replaced';
    const nx: AlpacaOrderLike = { ...cur!, id: `o${++this.n}`, client_order_id: r.client_order_id ?? cur!.client_order_id, qty: String(qty), filled_qty: '0', status: 'new', stop_price: r.stop_price != null ? String(r.stop_price) : cur!.stop_price, limit_price: r.limit_price != null ? String(r.limit_price) : cur!.limit_price };
    this.o.push(nx);
    return { ...nx };
  }
  async openOrders() { return this.o.filter((x) => OPENS.includes(x.status)).map((x) => ({ ...x })); }
  async orders() { return [...this.o].reverse().map((x) => ({ ...x })); }
  async getOrder(id: string) {
    if (this.getOrderFailsAfterPlace > 0) { this.getOrderFailsAfterPlace--; this.e('GET', 503, 'service unavailable'); }
    const x = this.o.find((y) => y.id === id);
    if (!x) this.e('GET', 404, 'nf');
    if (x!.status === 'pending_cancel') { x!.cancelPolls = (x!.cancelPolls ?? 0) - 1; if (x!.cancelPolls! <= 0) x!.status = 'canceled'; }
    return { ...x! };
  }
  async getOrderByClientOrderId(c: string) { const x = this.o.find((y) => y.client_order_id === c); return x ? { ...x } : null; }
  async cancelOrder(id: string) {
    const x = this.o.find((y) => y.id === id);
    if (!x || !OPENS.includes(x.status) || x.status === 'pending_cancel') this.e('DELETE', 422, 'not cancelable');
    if (this.cancelHangPolls > 0) { x!.status = 'pending_cancel'; x!.cancelPolls = this.cancelHangPolls; } else x!.status = 'canceled';
    return {};
  }
  async positions() { return Object.entries(this.pos).filter(([, q]) => q > 1e-12).map(([symbol, q]) => ({ symbol, qty: String(q), qty_available: String(this.avail(symbol)) })); }
  /** alle tijd verstrijkt: hangende cancels worden definitief */
  settle() { for (const x of this.o) if (x.status === 'pending_cancel') x.status = 'canceled'; }
  stops(sym: string) { return this.o.filter((x) => x.symbol === sym && x.type !== 'market' && x.side === 'sell' && OPENS.includes(x.status) && x.status !== 'pending_cancel'); }
  stopQty(sym: string) { return r9(this.stops(sym).reduce((s, x) => s + Number(x.qty) - Number(x.filled_qty), 0)); }
}

function memStore(initial: VersionBook, pending: OrderIntent[] = []) {
  let book: VersionBook | null = structuredClone(initial);
  let pend = pending;
  const store: Store = {
    loadBook: async () => (book ? structuredClone(book) : null),
    saveBook: async (b) => { book = structuredClone(b); },
    loadPending: async () => pend,
    savePending: async (_id, o) => { pend = o; },
    logEquity: async () => {}, logTrade: async () => {}, logDecision: async () => {},
  };
  return { store, book: () => book!, pending: () => pend };
}
const noSleep = { sleep: async () => {} };
const qldBars = { QLD: makeBars(60, 50, 0.01, 0.02), SPY: makeBars(60, 100, 0.001, 0.01) };
const P5 = momentumStopClientPrefix(m5!);
const P6 = momentumStopClientPrefix(m6);
const m5Book = (qty: number, cash = 0) => { const b = newBook(m5!, '2024-01-01', 100); b.real = true; b.cash = cash; if (qty) b.positions.QLD = { qty, entryPrice: 50, entryDate: '2024-05-01', highWater: 60 }; return b; };
const run5 = (fa: DaveAlpaca, mem: ReturnType<typeof memStore>, px = 55, foreignQty?: (s: string, v: string) => Promise<number>) =>
  executeDay({ date: '2024-06-03', cfgs: [m5!], hooks: m5Hooks, lastPrice: { QLD: px }, barsBySymbol: qldBars, broker: makeAlpacaPaperBroker(fa, noSleep), store: mem.store, expectReal: true, foreignQty });

describe('PR47 v3 integratie (echte broker, Daves Alpaca)', () => {
  it('I1 (=N1) exit met eigen GTC-stop open: positie wordt echt verkocht', async () => {
    const fa = new DaveAlpaca(); fa.pos.QLD = 20; fa.px.QLD = 55;
    await fa.placeOrder({ symbol: 'QLD', qty: 20, side: 'sell', type: 'stop', time_in_force: 'gtc', stop_price: 42, client_order_id: `${P5}QLD-20-4200-a` });
    const mem = memStore(m5Book(20), [{ symbol: 'QLD', side: 'sell', qty: 20, reason: 'regime' }]);
    await run5(fa, mem);
    expect(fa.pos.QLD ?? 0).toBe(0);
    expect(mem.book().positions.QLD).toBeUndefined();
  });

  it('I2 (=N1b/N2) stop verhogen bij volle positie: precies één stop, op het hogere niveau', async () => {
    const fa = new DaveAlpaca(); fa.pos.QLD = 20;
    await fa.placeOrder({ symbol: 'QLD', qty: 20, side: 'sell', type: 'stop', time_in_force: 'gtc', stop_price: 30, client_order_id: `${P5}QLD-20-3000-a` });
    const b = makeAlpacaPaperBroker(fa, noSleep);
    await b.setStop({ versionId: m5!.id, symbol: 'QLD', qty: 20, stopPrice: 35, stopClientPrefix: P5 });
    expect(fa.stops('QLD').map((x) => [x.qty, x.stop_price])).toEqual([['20', '35']]);
  });

  it('I3 (=N3) M1 heeft 0,04 BTC, M6 koopt 0,06 (fee 0,25%): M6-stop dekt nooit M1-stukken', async () => {
    const fa = new DaveAlpaca(); fa.pos['BTC/USD'] = 0.04; fa.px['BTC/USD'] = 50000; fa.fee = 0.0025;
    const b6 = newBook(m6, '2024-01-01', 100); b6.real = true; b6.cash = 10000;
    const mem = memStore(b6, [{ symbol: 'BTC/USD', side: 'buy', notionalUsd: 3000, reason: 'breakout', signalDate: '2024-06-02' }]);
    await executeDay({ date: '2024-06-03', cfgs: [m6], hooks: m6Hooks, lastPrice: { 'BTC/USD': 50000 }, barsBySymbol: { 'BTC/USD': makeBars(60, 50000, 0.001, 0.02) }, broker: makeAlpacaPaperBroker(fa, noSleep), store: mem.store, expectReal: true, foreignQty: async () => 0 });
    const m6Real = r9(fa.pos['BTC/USD']! - 0.04);
    expect(fa.stopQty('BTC/USD')).toBeGreaterThan(0);
    expect(fa.stopQty('BTC/USD')).toBeLessThanOrEqual(m6Real + 1e-9);
  });

  it('I4 (=L8) deels gevulde stop over twee runs: boek één keer bijgewerkt, één stop op de rest', async () => {
    const fa = new DaveAlpaca(); fa.pos.QLD = 20;
    await fa.placeOrder({ symbol: 'QLD', qty: 20, side: 'sell', type: 'stop', time_in_force: 'gtc', stop_price: 42, client_order_id: `${P5}QLD-20-4200-a` });
    fa.fill(fa.o[0]!, 8, 42);
    const mem = memStore(m5Book(20));
    await run5(fa, mem, 43); await run5(fa, mem, 43);
    expect(mem.book().positions.QLD?.qty).toBe(12);
    expect(fa.stopQty('QLD')).toBe(12);
  });

  it('I5 (=L1/L1b) stop plaatsen faalt na buy-fill: fill in boek, geen tweede buy bij retry, stop-gat gemarkeerd', async () => {
    const fa = new DaveAlpaca(); fa.px.QLD = 50; fa.failStops = true;
    const mem = memStore(m5Book(0, 5000), [{ symbol: 'QLD', side: 'buy', notionalUsd: 1000, reason: 'in' }]);
    await run5(fa, mem, 50).catch(() => {}); await run5(fa, mem, 50).catch(() => {});
    expect(fa.pos.QLD).toBe(20);
    expect(mem.book().positions.QLD?.qty).toBe(20);
    expect(mem.pending().filter((x) => x.side === 'buy')).toEqual([]);
    expect(mem.book().stopMissing?.QLD).toBeTruthy();
  });

  it('P1 exit terwijl Alpaca de stop-cancel in pending_cancel houdt (>3s): na de run is de positie verkocht OF heeft ze een stop', async () => {
    const fa = new DaveAlpaca(); fa.pos.QLD = 20; fa.px.QLD = 55;
    await fa.placeOrder({ symbol: 'QLD', qty: 20, side: 'sell', type: 'stop', time_in_force: 'gtc', stop_price: 42, client_order_id: `${P5}QLD-20-4200-a` });
    fa.cancelHangPolls = 30; // 30 polls x 250ms: tientallen seconden, Alpaca-forum noemt dit voor live trading
    const mem = memStore(m5Book(20), [{ symbol: 'QLD', side: 'sell', qty: 20, reason: 'regime' }]);
    await run5(fa, mem).catch(() => {});
    console.log('P1', JSON.stringify({ pos: fa.pos.QLD, orders: fa.o.map((x) => [x.type, x.side, x.qty, x.status]), book: mem.book().positions.QLD, pending: mem.pending(), stopMissing: mem.book().stopMissing }));
    fa.settle(); // de cancel gaat alsnog door, de volgende run is pas morgen
    const pos = fa.pos.QLD ?? 0;
    expect(pos === 0 || fa.stopQty('QLD') >= pos).toBe(true);
  });

  it('P2 stop verhogen terwijl de stop nog "accepted" is (buiten sessie): oude stop blijft staan, nooit een gat', async () => {
    const fa = new DaveAlpaca(); fa.pos.QLD = 20; fa.stopStatus = 'accepted';
    await fa.placeOrder({ symbol: 'QLD', qty: 20, side: 'sell', type: 'stop', time_in_force: 'gtc', stop_price: 30, client_order_id: `${P5}QLD-20-3000-a` });
    const b = makeAlpacaPaperBroker(fa, noSleep);
    await b.setStop({ versionId: m5!.id, symbol: 'QLD', qty: 20, stopPrice: 35, stopClientPrefix: P5 }).catch(() => {});
    expect(fa.stopQty('QLD')).toBe(20);
  });

  it('P3 buy gevuld maar GET /orders faalt tijdelijk (503) tijdens pollen: geen positie zonder boek+stop, geen tweede buy', async () => {
    const fa = new DaveAlpaca(); fa.px.QLD = 50; fa.getOrderFailsAfterPlace = 1;
    const mem = memStore(m5Book(0, 5000), [{ symbol: 'QLD', side: 'buy', notionalUsd: 1000, reason: 'in' }]);
    await run5(fa, mem, 50).catch(() => {});
    // reconcile aan het eind van execute, zoals web/lib/momentum5/run.ts
    await reconcileDisasterStops({ date: '2024-06-03', cfgs: [m5!], books: { [m5!.id]: mem.book() }, hooks: m5Hooks, barsBySymbol: qldBars, broker: makeAlpacaPaperBroker(fa, noSleep) } as never).catch(() => {});
    console.log('P3', JSON.stringify({ pos: fa.pos.QLD, orders: fa.o.map((x) => [x.type, x.side, x.qty, x.status]), book: mem.book().positions.QLD ?? null, pending: mem.pending(), openOrders: mem.book().openOrders }));
    // P3b: volgende handelsdag, pending ongewijzigd (of decide plant opnieuw dezelfde buy): mag niet nog eens kopen
    await executeDay({ date: '2024-06-04', cfgs: [m5!], hooks: m5Hooks, lastPrice: { QLD: 50 }, barsBySymbol: qldBars, broker: makeAlpacaPaperBroker(fa, noSleep), store: mem.store, expectReal: true }).catch(() => {});
    console.log('P3b', JSON.stringify({ pos: fa.pos.QLD, book: mem.book().positions.QLD?.qty ?? null, stopQty: fa.stopQty('QLD') }));
    expect(fa.pos.QLD).toBe(20);
    const protectedNow = (mem.book().positions.QLD?.qty ?? 0) === 20 && fa.stopQty('QLD') === 20;
    expect(protectedNow).toBe(true);
  });

  it('P4 crypto stop verhogen via PATCH met fractionele qty (docs: "only patch full shares"): stop blijft minstens bestaan', async () => {
    const fa = new DaveAlpaca(); fa.pos['BTC/USD'] = 0.06;
    await fa.placeOrder({ symbol: 'BTC/USD', qty: 0.06, side: 'sell', type: 'stop_limit', time_in_force: 'gtc', stop_price: 40000, limit_price: 39800, client_order_id: `${P6}BTC/USD-0.06-4000000-a` });
    const orig = fa.replaceOrder.bind(fa);
    fa.replaceOrder = async (id, r) => { if (r.qty != null && !Number.isInteger(r.qty)) fa.e('PATCH', 422, 'qty must be whole'); return orig(id, r); };
    const b = makeAlpacaPaperBroker(fa, noSleep);
    await b.setStop({ versionId: m6.id, symbol: 'BTC/USD', qty: 0.06, stopPrice: 45000, stopClientPrefix: P6 }).catch(() => {});
    expect(fa.stopQty('BTC/USD')).toBe(0.06);
  });
});
