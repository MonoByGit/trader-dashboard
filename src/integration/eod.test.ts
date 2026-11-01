/** @jest-environment node */
import { jest } from '@jest/globals';

const pos = (qa: string) => ({
  symbol: 'QQQ',
  qty: '10',
  qty_available: qa,
  current_price: '100',
  avg_entry_price: '99',
  market_value: '1000',
  cost_basis: '990',
  unrealized_pl: '10',
  unrealized_plpc: '0.01',
  side: 'long' as const,
  asset_class: 'us_equity' as const,
  change_today: '0.01',
});

async function load(qa: string, ready: boolean, closeFails: boolean) {
  jest.resetModules();
  const placeOrder = jest.fn(async () => ({ id: 'x' }));
  const events: string[] = [];
  jest.unstable_mockModule('@/strategy.json', () => ({
    default: { rules: { hard_stop_pct: 0.02, take_profit_pct: 0.05 } },
  }));
  jest.unstable_mockModule('@/lib/alpaca', () => ({
    alpaca: {
      closePosition: async () => {
        if (closeFails) throw new Error('fail');
        return {};
      },
      positions: async () => [pos(qa)],
      placeOrder,
    },
  }));
  jest.unstable_mockModule('@/lib/alpaca-orders', () => ({
    cancelSellLegsAndWait: async () => ({
      cancelled: 0,
      ready,
      remainingLegs: ready ? [] : [{ id: 'l', status: 'new' }],
    }),
  }));
  jest.unstable_mockModule('@/lib/momentum2/ownership', () => ({
    foreignQtyForSymbol: async () => 0,
  }));
  jest.unstable_mockModule('@/lib/guards/service', () => ({
    logGuardEvent: async (k: string) => {
      events.push(k);
    },
  }));
  const m = await import('@/lib/eod-flatten');
  return { m, placeOrder, events };
}

describe('B-4 EOD flatten', () => {
  it('cancel_stuck with legs reserving qty -> no restop, failed', async () => {
    const { m, placeOrder, events } = await load('0', false, false);
    const r = await m.flattenEtfPositionAtEod('QQQ');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.restopPlaced).toBe(false);
    expect(placeOrder).not.toHaveBeenCalled();
    expect(events).toContain('eod_flatten_cancel_stuck');
  });

  it('cancel_stuck but qty free -> restop on qty_available', async () => {
    const { m, placeOrder } = await load('10', false, false);
    const r = await m.flattenEtfPositionAtEod('QQQ');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.restopPlaced).toBe(true);
    expect(placeOrder.mock.calls[0][0]).toMatchObject({
      qty: 10,
      type: 'stop',
      time_in_force: 'gtc',
      stop_price: 98,
    });
  });

  it('close fails with no qty_available -> no restop', async () => {
    const { m, placeOrder } = await load('0', true, true);
    const r = await m.flattenEtfPositionAtEod('QQQ');
    expect(r.ok).toBe(false);
    expect(placeOrder).not.toHaveBeenCalled();
  });
});
