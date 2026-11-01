import { jest } from '@jest/globals';

const openOrders = jest.fn<() => Promise<{ id: string; symbol: string }[]>>();
const cancelOrder = jest.fn<() => Promise<unknown>>();
const getOrder = jest.fn<() => Promise<{ status: string }>>();
const closePosition = jest.fn<() => Promise<{ ok: true }>>();

await jest.unstable_mockModule('./alpaca', () => ({
  alpaca: {
    openOrders,
    cancelOrder,
    getOrder,
    closePosition,
  },
}));

const { closePositionAfterCancelingOrders } = await import('./alpaca-position-close');

describe('closePositionAfterCancelingOrders (M-7 equity)', () => {
  beforeEach(() => {
    openOrders.mockReset();
    cancelOrder.mockReset();
    getOrder.mockReset();
    closePosition.mockReset();
    closePosition.mockResolvedValue({ ok: true });
    getOrder.mockResolvedValue({ status: 'canceled' });
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
  });

  it('throws when a cancel fails without closing', async () => {
    openOrders.mockResolvedValue([{ id: 'stop-1', symbol: 'QQQ' }]);
    cancelOrder.mockRejectedValue(new Error('network'));
    getOrder.mockResolvedValue({ status: 'accepted' });

    await expect(closePositionAfterCancelingOrders('QQQ')).rejects.toThrow(/Failed to cancel/);
    expect(closePosition).not.toHaveBeenCalled();
  });
});
