/** @jest-environment node */
// Dave repro PR 47: schaduwboek -> papier. loadOrInitRealBook mag geen schaduwposities als echt markeren.
import { jest } from '@jest/globals';

it('F1 bestaand schaduwboek met QLD 100 wordt niet stilzwijgend real:true met fantoompositie', async () => {
  jest.resetModules();
  jest.unstable_mockModule('@/lib/alpaca', () => ({ alpaca: {} }));
  const { loadOrInitRealBook } = await import('@/lib/momentum2/paper-run');
  const { newBook } = await import('../../../../src/momentum2/book');
  const { m5Versions } = await import('../../../../src/momentum5/config');
  const { foreignQtyFromRealBooks } = await import('../../../../src/momentum2/book-aggregate');
  const [cfg] = m5Versions(100_000);
  let saved = newBook(cfg!, '2026-10-01', 500);
  saved.positions.QLD = { qty: 100, entryPrice: 50, entryDate: '2026-10-10', highWater: 55 }; // alleen schaduw, nooit bij Alpaca gekocht
  saved.cash -= 5000;
  const store = {
    loadBook: async () => structuredClone(saved), saveBook: async (b: typeof saved) => { saved = structuredClone(b); },
    loadPending: async () => [], savePending: async () => {}, logEquity: async () => {}, logTrade: async () => {}, logDecision: async () => {},
  };
  const b = await loadOrInitRealBook(store as never, cfg!, 500, '2026-11-02');
  const realWithPhantom = b.real === true && (b.positions.QLD?.qty ?? 0) > 0;
  // gevolg als dit true is: reconcile zet een sell-stop op 100 QLD die de rekening niet heeft, en M1 telt 100 QLD als 'foreign'
  expect({ realWithPhantom, m1ForeignQLD: foreignQtyFromRealBooks([b], 'QLD') }).toEqual({ realWithPhantom: false, m1ForeignQLD: 0 });
});

it('F2 terug naar schaduw (DRY_RUN weer 1) met een echt boek: schaduwkoop komt niet als echte positie in het real boek', async () => {
  jest.resetModules();
  jest.unstable_mockModule('@/lib/alpaca', () => ({ alpaca: {} }));
  const { shadowBroker } = await import('@/lib/momentum2/broker');
  const { executeDay } = await import('../../../../src/momentum2/live');
  const { newBook } = await import('../../../../src/momentum2/book');
  const { m5Versions } = await import('../../../../src/momentum5/config');
  const { m5Hooks } = await import('../../../../src/momentum5/plan');
  const [cfg] = m5Versions(100_000);
  let saved = newBook(cfg!, '2026-10-01', 500); saved.real = true; saved.cash = 5000;
  let pending = [{ symbol: 'QLD', side: 'buy' as const, notionalUsd: 1000, reason: 'in' }];
  const store = {
    loadBook: async () => structuredClone(saved), saveBook: async (b: typeof saved) => { saved = structuredClone(b); },
    loadPending: async () => pending, savePending: async (_: string, o: typeof pending) => { pending = o; }, logEquity: async () => {}, logTrade: async () => {}, logDecision: async () => {},
  };
  await executeDay({ date: '2026-11-03', cfgs: [cfg!], hooks: m5Hooks, lastPrice: { QLD: 50 }, broker: shadowBroker({ QLD: 50 }), store: store as never, expectReal: false });
  expect({ real: saved.real, QLD: saved.positions.QLD?.qty ?? 0 }).not.toEqual({ real: true, QLD: 20 });
});
