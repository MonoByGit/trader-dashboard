// REPRO C1: alpacaHttpStatusFromError must parse real del() error messages (URL contains colons).
import { AlpacaHttpError } from './alpaca-http-error.js';
import { alpacaHttpStatusFromError } from './parse-http-error.js';
import { awaitStopOrderCanceled } from '../crypto/cancel-stop-order.js';

const REAL = new AlpacaHttpError(
  'DELETE',
  'https://paper-api.alpaca.markets/v2/orders/sl-1',
  422,
  '{"code":42210000,"message":"order is not cancelable"}',
);

describe('REPRO 422 parse', () => {
  it('parses status from the real del() error message', () => {
    expect(alpacaHttpStatusFromError(REAL)).toBe(422);
    const legacy = new Error(
      'Alpaca DELETE https://paper-api.alpaca.markets/v2/orders/sl-1: 422 {"code":42210000}',
    );
    expect(alpacaHttpStatusFromError(legacy)).toBe(422);
  });

  it('422 + already filled => filled (no extra sell)', async () => {
    const r = await awaitStopOrderCanceled('sl-1', {
      cancelOrder: async () => {
        throw REAL;
      },
      getOrder: async () => ({ status: 'filled' }),
      sleep: async () => {},
    });
    expect(r).toBe('filled');
  });

  it('422 + pending_cancel => keeps polling to canceled', async () => {
    const seq = ['pending_cancel', 'pending_cancel', 'canceled'];
    const r = await awaitStopOrderCanceled('sl-1', {
      cancelOrder: async () => {
        throw REAL;
      },
      getOrder: async () => ({ status: seq.shift() ?? 'canceled' }),
      sleep: async () => {},
    });
    expect(r).toBe('canceled');
  });
});
