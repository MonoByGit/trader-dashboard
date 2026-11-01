import { jest } from '@jest/globals';
import { pollOrderFilledQty, resolveCryptoPositionSellQty } from './buy-fill-qty.js';

describe('pollOrderFilledQty', () => {
  it('waits through partially_filled until filled', async () => {
    const getOrder = jest
      .fn()
      .mockResolvedValueOnce({ status: 'partially_filled', filled_qty: '0.005' })
      .mockResolvedValueOnce({ status: 'filled', filled_qty: '0.01' });

    await pollOrderFilledQty('ord-1', getOrder, { attempts: 5, delayMs: 0 });
    expect(getOrder).toHaveBeenCalledTimes(2);
    expect(getOrder).toHaveBeenCalledTimes(2);
  });
});

describe('resolveCryptoPositionSellQty (B-5)', () => {
  it('uses position qty_available after fill, not gross filled_qty', async () => {
    const getOrder = jest.fn(async () => ({ status: 'filled', filled_qty: '0.01' }));
    const positions = jest.fn(async () => [
      { symbol: 'BTCUSD', qty: '0.01', qty_available: '0.0097' },
    ]);

    const qty = await resolveCryptoPositionSellQty('BTC/USD', 'ord-1', {
      getOrder,
      positions,
      symbolsEqual: (a, b) => a.replace('/', '') === b.replace('/', ''),
      poll: async (id, fn) => pollOrderFilledQty(id, fn, { attempts: 2, delayMs: 0 }),
    });

    expect(qty).toBe(0.0097);
  });

  it('polls with about 250ms delay by default', async () => {
    const getOrder = jest
      .fn()
      .mockResolvedValueOnce({ status: 'new', filled_qty: '0' })
      .mockResolvedValueOnce({ status: 'filled', filled_qty: '0.01' });
    const positions = jest.fn(async () => [
      { symbol: 'BTCUSD', qty: '0.0097', qty_available: '0.0097' },
    ]);
    const delays: number[] = [];
    const sleep = (ms: number) => {
      delays.push(ms);
      return Promise.resolve();
    };

    await resolveCryptoPositionSellQty('BTC/USD', 'ord-1', {
      getOrder,
      positions,
      symbolsEqual: (a, b) => a.replace('/', '') === b.replace('/', ''),
      sleep,
    });

    expect(delays).toContain(250);
  });
});
