// REPRO D2: buy POST timeout after Alpaca accepted — reconcile via client_order_id and protect position.
import { jest } from '@jest/globals';
import { placeOrderWithReconcile } from '../../../src/alpaca/order-post-reconcile.js';

const saveCryptoStop = jest.fn(async () => {});
const protectCryptoPositionAfterBuy = jest.fn(async () => {
  throw new Error('stop-limit fail');
});
const saveDecision = jest.fn(async () => {});
const logGuardEvent = jest.fn(async () => {});
const registerRoutineHandler = jest.fn();

await jest.unstable_mockModule('./stops', () => ({
  saveCryptoStop,
  protectCryptoPositionAfterBuy,
  enforceSoftwareCryptoStops: jest.fn(),
}));

await jest.unstable_mockModule('@/lib/decisions', () => ({ saveDecision }));
await jest.unstable_mockModule('@/lib/guards/service', () => ({
  logGuardEvent,
  refreshCircuitBreaker: jest.fn(async () => ({
    emergencyStop: false,
    tradingEnabled: true,
    circuitBreakerTripped: false,
  })),
  getEffectiveCryptoGuardConfig: jest.fn(async () => ({ hardStopPct: 0.08 })),
  checkOrderAgainstLimits: jest.fn(async () => ({ allowed: true, failReasons: [] })),
  countDailyTrades: jest.fn(async () => 0),
}));

await jest.unstable_mockModule('./state', () => ({
  isCryptoModuleEnabled: jest.fn(async () => true),
  countCryptoBuysTodayUtc: jest.fn(async () => 0),
  syncCryptoDayStart: jest.fn(async () => 1000),
}));

await jest.unstable_mockModule('@/lib/alpaca', () => ({
  alpaca: {
    account: jest.fn(async () => ({ equity: '100000', cash: '50000' })),
    positions: jest.fn(async () => []),
    cryptoBars: jest.fn(async () => ({ bars: { 'BTC/USD': [{ c: 90000, v: 1 }] } })),
    placeOrder: jest.fn(async (o: { client_order_id?: string; symbol: string; qty?: number }) =>
      placeOrderWithReconcile(o.client_order_id, {
        submit: async () => {
          throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
        },
        lookupByClientOrderId: async () => ({
          id: 'buy-recovered',
          symbol: o.symbol,
          side: 'buy',
          qty: String(o.qty ?? 0),
          filled_qty: '0',
          type: 'market',
          status: 'new',
          submitted_at: new Date().toISOString(),
          filled_at: null,
          filled_avg_price: null,
          limit_price: null,
          stop_price: null,
        }),
      }),
    ),
  },
}));

await jest.unstable_mockModule('@/lib/asset-class', () => ({
  filterByAssetClass: jest.fn((_p: unknown[], cls: string) => (cls === 'crypto' ? [] : [])),
}));

await jest.unstable_mockModule('@/lib/sleeves', () => ({
  sleevesFromAlpacaLive: jest.fn(async () => ({
    crypto: { equityUsd: 1000, exposureUsd: 0 },
  })),
}));

await jest.unstable_mockModule('@/lib/orders-store', () => ({
  syncRecentOrders: jest.fn(async () => {}),
}));
await jest.unstable_mockModule('@/lib/routine-dispatch', () => ({ registerRoutineHandler }));
await jest.unstable_mockModule('@/crypto-strategy.json', () => ({
  default: { name: 't', rules: { max_positions: 2, hard_stop_pct: 0.08, position_size_pct: 0.05 } },
}));
await jest.unstable_mockModule('./strategy-version', () => ({
  getCryptoSymbols: jest.fn(() => ['BTC/USD']),
}));
await jest.unstable_mockModule('@/lib/ai', () => ({
  claudeJsonArray: jest.fn(async () => [{ symbol: 'BTC/USD', action: 'buy', reason: 'test' }]),
  MODELS: { sonnet: 's' },
  AiJsonParseError: class extends Error {},
}));
await jest.unstable_mockModule('@guards/index', () => ({
  blocksNewEntries: jest.fn(() => false),
  evaluateCryptoLimits: jest.fn(() => ({ allowed: true, failReasons: [] })),
}));

await import('./routines');

describe('buy timeout', () => {
  it('protects or reconciles an order that may have been accepted', async () => {
    const handler = registerRoutineHandler.mock.calls.find((c) => c[0] === 'crypto-scan')?.[1];
    await handler!();
    expect(saveCryptoStop).toHaveBeenCalled();
    expect(saveDecision).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'BUY', orderId: 'buy-recovered' }),
    );
  });
});
