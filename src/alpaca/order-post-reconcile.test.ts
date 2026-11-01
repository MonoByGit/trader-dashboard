import { jest } from '@jest/globals';
import { AlpacaHttpError } from './alpaca-http-error.js';
import { placeOrderWithReconcile } from './order-post-reconcile.js';

describe('placeOrderWithReconcile', () => {
  it('returns reconciled order after POST timeout when client order exists', async () => {
    const submit = jest.fn(async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });
    const lookupByClientOrderId = jest.fn(async () => ({ id: 'ord-1', status: 'new' }));

    const order = await placeOrderWithReconcile('cid-1', { submit, lookupByClientOrderId });

    expect(order.id).toBe('ord-1');
    expect(lookupByClientOrderId).toHaveBeenCalledWith('cid-1');
  });

  it('rethrows timeout when no order exists for client_order_id', async () => {
    const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    const submit = jest.fn(async () => {
      throw timeout;
    });
    const lookupByClientOrderId = jest.fn(async () => null);

    await expect(
      placeOrderWithReconcile('cid-missing', { submit, lookupByClientOrderId }),
    ).rejects.toBe(timeout);
  });

  it('returns reconciled order after POST 5xx when client order exists', async () => {
    const err = new AlpacaHttpError('POST', 'https://paper-api.alpaca.markets/v2/orders', 503, 'busy');
    const submit = jest.fn(async () => {
      throw err;
    });
    const lookupByClientOrderId = jest.fn(async () => ({ id: 'ord-5xx', status: 'accepted' }));

    const order = await placeOrderWithReconcile('cid-5xx', { submit, lookupByClientOrderId });
    expect(order.id).toBe('ord-5xx');
  });
});
