import { flattenReadyAfterCancels, openSellLegsStillActive } from './eod-flatten.js';

describe('eod flatten cancel polling', () => {
  it('waits until sell legs are no longer open', () => {
    expect(flattenReadyAfterCancels([{ id: '1', status: 'canceled' }])).toBe(true);
    expect(flattenReadyAfterCancels([{ id: '1', status: 'new' }])).toBe(false);
    expect(openSellLegsStillActive([{ id: '1', status: 'accepted' }])).toHaveLength(1);
  });
});
