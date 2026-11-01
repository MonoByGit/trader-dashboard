import { flattenReadyAfterCancels, isOpenSellLegStatus, openSellLegsStillActive } from './eod-flatten.js';

describe('openSellLegsStillActive', () => {
  it('treats pending_cancel as still open', () => {
    expect(isOpenSellLegStatus('pending_cancel')).toBe(true);
    const legs = [{ id: '1', status: 'pending_cancel' }];
    expect(openSellLegsStillActive(legs)).toHaveLength(1);
    expect(flattenReadyAfterCancels(legs)).toBe(false);
  });
});
