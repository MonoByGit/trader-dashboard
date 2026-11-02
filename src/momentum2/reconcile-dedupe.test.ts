import { m6Hooks } from '../momentum6/plan';
import { m6Config } from '../momentum6/config';
import { reconcileDisasterStops } from './reconcile-disaster-stops';
import { newBook } from './book';
import { makeBars } from './fixtures';

describe('reconcileDisasterStops dedupe', () => {
  it('annuleert duplicate stop via orderId, niet de keeper', async () => {
    const cfg = m6Config();
    const book = newBook(cfg, '2024-01-01', 100);
    book.real = true;
    book.positions['BTC/USD'] = {
      qty: 0.1,
      entryPrice: 100,
      entryDate: '2024-05-01',
      highWater: 110,
      signalDate: '2024-05-01',
    };

    const cancelled: string[] = [];
    const broker = {
      marketOrder: async () => null,
      setStop: async () => {},
      cancelStop: async (o: { orderId?: string }) => {
        if (o.orderId) cancelled.push(o.orderId);
      },
      stopFill: async () => null,
      listOpenStops: async () => [
        {
          symbol: 'BTCUSD',
          qty: 0.1,
          stopPrice: 8000,
          clientOrderId: 'm6s-m6-btc-breakout-BTC/USD-0.1-8000-2',
          orderId: 'keep-me',
        },
        {
          symbol: 'BTCUSD',
          qty: 0.1,
          stopPrice: 7900,
          clientOrderId: 'm6s-m6-btc-breakout-BTC/USD-0.1-7900-1',
          orderId: 'drop-me',
        },
      ],
      positionQty: async () => 0.1,
    };

    const btc = makeBars(40, 100, 0.005, 0.02);
    await reconcileDisasterStops({
      date: '2024-06-10',
      cfgs: [cfg],
      books: { [cfg.id]: book },
      hooks: m6Hooks,
      barsBySymbol: { 'BTC/USD': btc },
      broker,
    });

    expect(cancelled).toEqual(['drop-me']);
    expect(cancelled).not.toContain('keep-me');
  });
});
