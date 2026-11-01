// REPRO C2: UI sends Alpaca's position symbol "BTCUSD"; must use exitCryptoPosition (lock + cleanup).
import { jest } from '@jest/globals';

const exitCryptoPosition = jest.fn(async () => ({ exited: true }));

jest.unstable_mockModule('@/lib/crypto/exit-crypto-position', () => ({ exitCryptoPosition }));

jest.unstable_mockModule('./alpaca', () => ({
  alpaca: {
    openOrders: jest.fn(async () => []),
    getOrder: jest.fn(),
    cancelOrder: jest.fn(),
    closePosition: jest.fn(async () => ({ id: 'c1' })),
    positions: jest.fn(async () => [
      { symbol: 'BTCUSD', qty: '0.01', qty_available: '0.01', asset_class: 'crypto' },
    ]),
  },
}));

const { closePositionAfterCancelingOrders } = await import('./alpaca-position-close');

it('manual close of BTCUSD goes through exitCryptoPosition', async () => {
  await closePositionAfterCancelingOrders('BTCUSD');
  expect(exitCryptoPosition).toHaveBeenCalled();
});
