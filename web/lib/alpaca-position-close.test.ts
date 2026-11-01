import { jest } from '@jest/globals';

const exitCryptoPosition = jest.fn<() => Promise<{ exited: boolean }>>();
const openOrders = jest.fn<() => Promise<{ id: string; symbol: string }[]>>();
const cancelOrder = jest.fn<() => Promise<unknown>>();
const getOrder = jest.fn<() => Promise<{ status: string }>>();
const closePosition = jest.fn<() => Promise<{ ok: true }>>();
const positions = jest.fn<() => Promise<{ symbol: string; asset_class?: string }[]>>();

await jest.unstable_mockModule('@/lib/crypto/exit-crypto-position', () => ({
  exitCryptoPosition,
}));

await jest.unstable_mockModule('./alpaca', () => ({
  alpaca: {
    openOrders,
    cancelOrder,
    getOrder,
    closePosition,
    positions,
  },
}));

const { closePositionAfterCancelingOrders } = await import('./alpaca-position-close');

describe('closePositionAfterCancelingOrders (M-7 equity)', () => {
  beforeEach(() => {
    exitCryptoPosition.mockReset();
    openOrders.mockReset();
    cancelOrder.mockReset();
    getOrder.mockReset();
    closePosition.mockReset();
    positions.mockReset();
    closePosition.mockResolvedValue({ ok: true });
    getOrder.mockResolvedValue({ status: 'canceled' });
    positions.mockResolvedValue([]);
  });

  it('cancels open orders for the symbol before closing', async () => {
    openOrders
      .mockResolvedValueOnce([
        { id: 'stop-1', symbol: 'QQQ' },
        { id: 'other', symbol: 'SPY' },
      ])
      .mockResolvedValue([]);

    await closePositionAfterCancelingOrders('QQQ');

    expect(cancelOrder).toHaveBeenCalledWith('stop-1');
    expect(cancelOrder).not.toHaveBeenCalledWith('other');
    expect(closePosition).toHaveBeenCalledWith('QQQ');
    expect(exitCryptoPosition).not.toHaveBeenCalled();
  });

  it('throws when a cancel fails without closing', async () => {
    openOrders.mockResolvedValue([{ id: 'stop-1', symbol: 'QQQ' }]);
    cancelOrder.mockRejectedValue(new Error('network'));
    getOrder.mockResolvedValue({ status: 'accepted' });

    await expect(closePositionAfterCancelingOrders('QQQ')).rejects.toThrow(/Failed to cancel/);
    expect(closePosition).not.toHaveBeenCalled();
  });

  it('returns alreadyClosed when stop leg filled before close', async () => {
    openOrders.mockResolvedValue([{ id: 'stop-1', symbol: 'QQQ' }]);
    cancelOrder.mockRejectedValue(
      new Error('Alpaca DELETE https://paper-api.alpaca.markets/v2/orders/stop-1: 422 body'),
    );
    getOrder.mockResolvedValue({ status: 'filled' });

    const result = await closePositionAfterCancelingOrders('QQQ');
    expect(result).toEqual({ alreadyClosed: true, reason: 'broker_filled' });
    expect(closePosition).not.toHaveBeenCalled();
  });
});
