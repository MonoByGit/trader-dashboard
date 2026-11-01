// REPRO D2: buy POST timeout with no reconciled order — must still save a tick stop (ambiguous).
import { jest } from '@jest/globals';

const saveCryptoStop = jest.fn(async () => {});
const protectCryptoPositionAfterBuy = jest.fn(async () => {
  throw new Error('stop-limit fail');
});
const saveDecision = jest.fn(async () => {});
const logGuardEvent = jest.fn(async () => {});
const registerRoutineHandler = jest.fn();

await jest.unstable_mockModule('./stops', () => ({
  saveCryptoStop,
  saveCryptoTakeProfit: jest.fn(),
  protectCryptoPositionAfterBuy,
  enforceSoftwareCryptoStops: jest.fn(),
  enforceSoftwareCryptoTakeProfit: jest.fn(),
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
  getEffectiveGuardConfig: jest.fn(async () => ({ maxDailyCryptoTrades: 2, maxDailyTrades: 3 })),
  checkOrderAgainstLimits: jest.fn(async () => ({ allowed: true, failReasons: [] })),
  countDailyTrades: jest.fn(async () => 0),
  countDailyCryptoTrades: jest.fn(async () => 0),
}));

await jest.unstable_mockModule('./daily-pnl-live', () => ({
  cryptoDailyPnlFromLive: jest.fn(() => 0),
  yesterdayUtcCloseBySymbol: jest.fn(() => ({})),
}));

await jest.unstable_mockModule('@/lib/buy-idempotency', () => ({
  gateBuyIfLockLost: jest.fn(async () => ({ allowed: true, reason: '' })),
  hasBuyDecisionTodayEt: jest.fn(async () => false),
}));

await jest.unstable_mockModule('@/lib/routine-run-context', () => ({
  getRoutineRunContext: jest.fn(() => ({ runId: 'test-run' })),
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
    cryptoBars: jest.fn(async () => ({
      bars: { 'BTC/USD': Array.from({ length: 20 }, () => ({ c: 90000, v: 1000 })) },
    })),
    placeOrder: jest.fn(async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    }),
    orders: jest.fn(async () => []),
  },
}));

await jest.unstable_mockModule('@/lib/asset-class', () => ({
  filterByAssetClass: jest.fn((_p: unknown[], cls: string) => (cls === 'crypto' ? [] : [])),
  classifySymbol: jest.fn(() => 'crypto'),
  isCryptoSymbol: jest.fn(() => true),
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
  default: {
    name: 't',
    rules: {
      max_positions: 2,
      hard_stop_pct: 0.08,
      take_profit_pct: 0.1,
      position_size_pct: 0.05,
      rsi_min: 0,
      rsi_max: 100,
      volume_ratio_min: 0,
    },
  },
}));
await jest.unstable_mockModule('./strategy-version', () => ({
  getCryptoSymbols: jest.fn(() => ['BTC/USD']),
}));
await jest.unstable_mockModule('@/lib/ai', () => ({
  claudeJsonArray: jest.fn(async () => [{ symbol: 'BTC/USD', action: 'buy', reason: 'test' }]),
  logFailedAiCall: jest.fn(),
  MODELS: { sonnet: 's' },
  AiJsonParseError: class extends Error {},
}));
await jest.unstable_mockModule('@guards/index', () => ({
  blocksNewEntries: jest.fn(() => false),
  evaluateCryptoLimits: jest.fn(() => ({ allowed: true, failReasons: [] })),
}));
await jest.unstable_mockModule('../../../src/crypto/entry-criteria', () => ({
  passesCryptoEntryCriteria: jest.fn(() => ({ ok: true })),
}));

await import('./routines');

describe('buy timeout', () => {
  it('protects or reconciles an order that may have been accepted', async () => {
    const handler = registerRoutineHandler.mock.calls.find((c) => c[0] === 'crypto-scan')?.[1];
    await handler!();
    expect(saveCryptoStop).toHaveBeenCalled();
    expect(logGuardEvent).toHaveBeenCalledWith(
      'crypto_order_ambiguous',
      expect.any(String),
      expect.objectContaining({ symbol: 'BTC/USD' }),
    );
  });
});
