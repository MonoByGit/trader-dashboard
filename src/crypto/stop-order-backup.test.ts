import {
  brokerStopOrdersBlockSoftwareBackup,
  stopOrderNeedsSoftwareBackup,
} from './stop-order-backup.js';

describe('stopOrderNeedsSoftwareBackup', () => {
  it('detects gap below stop-limit limit price', () => {
    expect(
      stopOrderNeedsSoftwareBackup(
        { side: 'sell', type: 'stop_limit', status: 'new', limit_price: '89550' },
        89_000,
      ),
    ).toBe(true);
  });

  it('detects triggered stop-limit', () => {
    expect(
      stopOrderNeedsSoftwareBackup(
        { side: 'sell', type: 'stop_limit', status: 'triggered', limit_price: '89550' },
        89_600,
      ),
    ).toBe(true);
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
