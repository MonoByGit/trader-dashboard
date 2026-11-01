import {
  MANUAL_ALPACA_ORDER_POST_ALLOWED,
  manualAlpacaOrderPostBlockedReason,
} from './manual-orders';

describe('manual Alpaca orders (M-9)', () => {
  it('blocks unguarded POST placement', () => {
    expect(MANUAL_ALPACA_ORDER_POST_ALLOWED).toBe(false);
    expect(manualAlpacaOrderPostBlockedReason()).toMatch(/disabled/);
  });
});
