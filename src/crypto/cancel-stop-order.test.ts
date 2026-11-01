import { jest } from '@jest/globals';
import { awaitStopOrderCanceled } from './cancel-stop-order.js';

describe('awaitStopOrderCanceled (B-6)', () => {
  it('returns filled when cancel gets 422 and order already filled', async () => {
    const cancelOrder = jest.fn(async () => {
      throw new Error('Alpaca DELETE: 422 already filled');
    });
    const getOrder = jest.fn(async () => ({ status: 'filled' }));

    const result = await awaitStopOrderCanceled('sl-1', { getOrder, cancelOrder });
    expect(result).toBe('filled');
  });

  it('returns canceled after polling pending_cancel', async () => {
    const cancelOrder = jest.fn(async () => undefined);
    const getOrder = jest
      .fn()
      .mockResolvedValueOnce({ status: 'pending_cancel' })
      .mockResolvedValueOnce({ status: 'canceled' });

    const result = await awaitStopOrderCanceled('sl-1', {
      getOrder,
      cancelOrder,
      delayMs: 0,
      attempts: 5,
      sleep: async () => {},
    });
    expect(result).toBe('canceled');
  });

  it('returns failed when cancel errors and order is still open', async () => {
    const cancelOrder = jest.fn(async () => {
      throw new Error('network');
    });
    const getOrder = jest.fn(async () => ({ status: 'accepted' }));

    const result = await awaitStopOrderCanceled('sl-1', { getOrder, cancelOrder });
    expect(result).toBe('failed');
  });
});
