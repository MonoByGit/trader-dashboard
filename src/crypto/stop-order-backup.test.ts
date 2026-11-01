import {
  brokerStopOrdersBlockSoftwareBackup,
  openSellStopBlocksSoftwareBackup,
  stopLimitGappedThroughLimit,
} from './stop-order-backup.js';

describe('stopLimitGappedThroughLimit', () => {
  it('is true when last price is below the stop-limit limit', () => {
    expect(
      stopLimitGappedThroughLimit(
        { side: 'sell', type: 'stop_limit', status: 'new', limit_price: '89550' },
        89_000,
      ),
    ).toBe(true);
  });
});

describe('openSellStopBlocksSoftwareBackup (B-6 inverted logic)', () => {
  it('blocks backup for partially_filled stop-limit above the market', () => {
    expect(
      openSellStopBlocksSoftwareBackup(
        { side: 'sell', type: 'stop_limit', status: 'partially_filled', limit_price: '89550' },
        89_600,
      ),
    ).toBe(true);
  });

  it('blocks backup for pending_new stop-limit', () => {
    expect(
      openSellStopBlocksSoftwareBackup(
        { side: 'sell', type: 'stop_limit', status: 'pending_new', limit_price: '89550' },
        89_600,
      ),
    ).toBe(true);
  });

  it('blocks backup when Alpaca reports stopped (trade guaranteed)', () => {
    expect(
      openSellStopBlocksSoftwareBackup(
        { side: 'sell', type: 'stop_limit', status: 'stopped', limit_price: '89550' },
        89_000,
      ),
    ).toBe(true);
  });

  it('does not block when price gapped below the limit', () => {
    expect(
      openSellStopBlocksSoftwareBackup(
        { side: 'sell', type: 'stop_limit', status: 'new', limit_price: '89550' },
        89_000,
      ),
    ).toBe(false);
  });
});

describe('brokerStopOrdersBlockSoftwareBackup', () => {
  const stopPrice = 90_000;

  it('blocks backup when a working stop-limit is still above the market', () => {
    const orders = [{ side: 'sell', type: 'stop_limit', status: 'accepted', limit_price: '89550' }];
    expect(brokerStopOrdersBlockSoftwareBackup(orders, 89_600, stopPrice)).toBe(true);
  });

  it('does not block when price gapped below the limit', () => {
    const orders = [{ side: 'sell', type: 'stop_limit', status: 'new', limit_price: '89550' }];
    expect(brokerStopOrdersBlockSoftwareBackup(orders, 89_000, stopPrice)).toBe(false);
  });
});
