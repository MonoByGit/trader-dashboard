import { planSoftwareTakeProfitAction, runSoftwareTakeProfitExit } from './software-take-profit';

describe('software take-profit (M-5)', () => {
  it('routes a triggered TP through exit helper even when a stop-limit sell is open', () => {
    expect(
      planSoftwareTakeProfitAction({
        lastPrice: 120,
        takeProfitPrice: 110,
        openStopLimitSell: true,
      }),
    ).toEqual({ action: 'exit_via_helper' });
  });

  it('calls exit helper at most once when stop-limit is open', async () => {
    let exitCalls = 0;
    const r = await runSoftwareTakeProfitExit({
      symbol: 'BTC/USD',
      lastPrice: 120,
      takeProfitPrice: 110,
      openStopLimitSell: true,
      logEvent: async () => {},
      exit: async () => {
        exitCalls += 1;
        return { orderId: 'exit-1' };
      },
    });
    expect(r.triggered).toBe(true);
    expect(exitCalls).toBe(1);
  });

  it('does not plan a broker TP limit order', () => {
    expect(
      planSoftwareTakeProfitAction({
        lastPrice: 120,
        takeProfitPrice: 110,
        openStopLimitSell: false,
      }),
    ).toEqual({ action: 'exit_via_helper' });
    expect(
      planSoftwareTakeProfitAction({
        lastPrice: 100,
        takeProfitPrice: 110,
        openStopLimitSell: false,
      }),
    ).toEqual({ action: 'none' });
  });
});
