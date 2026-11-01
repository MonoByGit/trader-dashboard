import { jest } from '@jest/globals';
import { pollOrderFilledQty, resolveCryptoPositionSellQty } from './buy-fill-qty.js';

describe('pollOrderFilledQty', () => {
  it('returns filled_qty when the buy order fills', async () => {
    const getOrder = jest
      .fn()
      .mockResolvedValueOnce({ status: 'new', filled_qty: '0' })
      .mockResolvedValueOnce({ status: 'filled', filled_qty: '0.0098' });

    const qty = await pollOrderFilledQty('ord-1', getOrder, { attempts: 5, delayMs: 0 });
    expect(qty).toBe(0.0098);
  });
});

describe('resolveCryptoPositionSellQty (B-5)', () => {
  it('uses filled qty instead of ordered qty when fill is smaller than order', async () => {
    const getOrder = jest.fn(async () => ({ status: 'filled', filled_qty: '0.0098' }));
    const positions = jest.fn(async () => [{ symbol: 'BTCUSD', qty: '0.01' }]);

    const qty = await resolveCryptoPositionSellQty('BTC/USD', 'ord-1', {
      getOrder,
      positions,
      symbolsEqual: (a, b) => a.replace('/', '') === b.replace('/', ''),
    });

    expect(qty).toBe(0.0098);
    expect(positions).not.toHaveBeenCalled();
  });

  it('falls back to position qty when polling times out', async () => {
    const getOrder = jest.fn(async () => ({ status: 'new', filled_qty: '0' }));
    const positions = jest.fn(async () => [{ symbol: 'BTCUSD', qty: '0.0097' }]);

    const qty = await resolveCryptoPositionSellQty('BTC/USD', 'ord-1', {
      getOrder,
      positions,
      symbolsEqual: (a, b) => a.replace('/', '') === b.replace('/', ''),
      poll: async (id, fn) => pollOrderFilledQty(id, fn, { attempts: 1, delayMs: 0 }),
    });

    expect(qty).toBe(0.0097);
  });
});
