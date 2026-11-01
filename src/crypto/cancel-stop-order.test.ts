import { jest } from '@jest/globals';
import { awaitStopOrderCanceled } from './cancel-stop-order.js';

describe('awaitStopOrderCanceled', () => {
  it('polls after 422 when order is pending_cancel', async () => {
    const cancelOrder = jest.fn(async () => {
      throw new Error('Alpaca DELETE x: 422 body');
    });
    const getOrder = jest
      .fn()
      .mockResolvedValueOnce({ status: 'pending_cancel' })
      .mockResolvedValueOnce({ status: 'canceled' });

    const outcome = await awaitStopOrderCanceled('o-1', {
      cancelOrder,
      getOrder,
      delayMs: 0,
      attempts: 5,
      sleep: async () => {},
    });
    expect(outcome).toBe('canceled');
    expect(getOrder.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('returns timeout after bounded poll with no terminal status', async () => {
    const cancelOrder = jest.fn(async () => undefined);
    const getOrder = jest.fn(async () => ({ status: 'pending_cancel' }));

    const outcome = await awaitStopOrderCanceled('o-1', {
      cancelOrder,
      getOrder,
      delayMs: 0,
      attempts: 3,
      sleep: async () => {},
    });
    expect(outcome).toBe('timeout');
  });
});
