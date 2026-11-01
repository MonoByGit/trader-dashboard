import { jest } from '@jest/globals';

const openOrders = jest.fn<() => Promise<{ id: string; symbol: string }[]>>();
const cancelOrder = jest.fn<() => Promise<unknown>>();
const closePosition = jest.fn<() => Promise<{ ok: true }>>();

await jest.unstable_mockModule('./alpaca', () => ({
  alpaca: {
    openOrders,
    cancelOrder,
    closePosition,
  },
}));

const { closePositionAfterCancelingOrders, ClosePositionOrdersTimeoutError } = await import(
  './alpaca-position-close'
);

describe('closePositionAfterCancelingOrders (M-7)', () => {
  beforeEach(() => {
    openOrders.mockReset();
    cancelOrder.mockReset();
    closePosition.mockReset();
    closePosition.mockResolvedValue({ ok: true });
  });

  it('cancels open orders for the symbol before closing', async () => {
    openOrders
      .mockResolvedValueOnce([
        { id: 'stop-1', symbol: 'BTCUSD' },
        { id: 'other', symbol: 'ETHUSD' },
      ])
      .mockResolvedValue([]);

    await closePositionAfterCancelingOrders('BTC/USD');

    expect(cancelOrder).toHaveBeenCalledWith('stop-1');
    expect(cancelOrder).not.toHaveBeenCalledWith('other');
    expect(closePosition).toHaveBeenCalledWith('BTCUSD');
  });

  it('throws when a cancel fails without closing', async () => {
    openOrders.mockResolvedValue([{ id: 'stop-1', symbol: 'BTCUSD' }]);
    cancelOrder.mockRejectedValue(new Error('422'));

    await expect(closePositionAfterCancelingOrders('BTC/USD')).rejects.toThrow(
      /Failed to cancel orders/,
    );
    expect(closePosition).not.toHaveBeenCalled();
  });

  it('throws a explicit timeout when stops are gone but position may remain open', async () => {
    openOrders
      .mockResolvedValueOnce([{ id: 'stop-1', symbol: 'BTCUSD' }])
      .mockResolvedValue([{ id: 'stop-1', symbol: 'BTCUSD' }]);
    cancelOrder.mockResolvedValue(undefined);

    await expect(closePositionAfterCancelingOrders('BTC/USD')).rejects.toBeInstanceOf(
      ClosePositionOrdersTimeoutError,
    );
    expect(closePosition).not.toHaveBeenCalled();
  });
});
