import { jest } from '@jest/globals';

const enforceSoftwareCryptoStops = jest.fn<() => Promise<{ triggered: boolean }>>();

await jest.unstable_mockModule('./stops', () => ({
  enforceSoftwareCryptoStops,
  placeCryptoStopLimit: jest.fn(),
  saveCryptoStop: jest.fn(),
  protectCryptoPositionAfterBuy: jest.fn(),
}));

await jest.unstable_mockModule('./state', () => ({
  isCryptoModuleEnabled: jest.fn(async () => false),
  countCryptoBuysTodayUtc: jest.fn(async () => 0),
  syncCryptoDayStart: jest.fn(async () => 0),
}));

await jest.unstable_mockModule('@/lib/alpaca', () => ({
  alpaca: {
    account: jest.fn(async () => ({ equity: '100000', cash: '50000' })),
    positions: jest.fn(async () => [
      {
        symbol: 'BTCUSD',
        current_price: '90000',
        market_value: '5000',
        asset_class: 'crypto',
      },
    ]),
    cryptoBars: jest.fn(async () => ({ bars: { 'BTC/USD': [{ c: 89000, v: 1 }] } })),
  },
}));

await jest.unstable_mockModule('@/lib/guards/service', () => ({
  refreshCircuitBreaker: jest.fn(async () => ({
    emergencyStop: true,
    tradingEnabled: false,
    circuitBreakerTripped: false,
  })),
  getEffectiveCryptoGuardConfig: jest.fn(),
  checkOrderAgainstLimits: jest.fn(),
  countDailyTrades: jest.fn(),
  logGuardEvent: jest.fn(),
}));

await jest.unstable_mockModule('@/lib/asset-class', () => ({
  filterByAssetClass: jest.fn((positions: { asset_class?: string }[], cls: string) =>
    cls === 'crypto' ? positions : [],
  ),
}));

await jest.unstable_mockModule('@/lib/sleeves', () => ({
  sleevesFromAlpacaLive: jest.fn(),
}));

await jest.unstable_mockModule('@/lib/decisions', () => ({
  saveDecision: jest.fn(),
}));

await jest.unstable_mockModule('@/lib/orders-store', () => ({
  syncRecentOrders: jest.fn(),
}));

const registerRoutineHandler = jest.fn();

await jest.unstable_mockModule('@/lib/routine-dispatch', () => ({
  registerRoutineHandler,
}));

await jest.unstable_mockModule('@/crypto-strategy.json', () => ({
  default: { name: 'test', rules: { max_positions: 2, hard_stop_pct: 0.08, position_size_pct: 0.05 } },
}));

await jest.unstable_mockModule('./strategy-version', () => ({
  getCryptoSymbols: jest.fn(() => ['BTC/USD']),
}));

await jest.unstable_mockModule('@/lib/ai', () => ({
  claudeJsonArray: jest.fn(),
  MODELS: { sonnet: 'sonnet' },
  AiJsonParseError: class extends Error {},
}));

const { runCryptoSoftwareStopsForPositions } = await import('./routines');

describe('runCryptoSoftwareStopsForPositions (M-6)', () => {
  beforeEach(() => {
    enforceSoftwareCryptoStops.mockReset();
    enforceSoftwareCryptoStops.mockResolvedValue({ triggered: false });
  });

  it('enforces software stops for each crypto position', async () => {
    await runCryptoSoftwareStopsForPositions(
      [{ symbol: 'BTCUSD', current_price: '90000' } as never],
      { 'BTC/USD': [{ c: 89_000, v: 1 }] },
      ['BTC/USD'],
    );
    expect(enforceSoftwareCryptoStops).toHaveBeenCalledWith('BTCUSD', 89_000);
  });

  it('logs crypto_software_stop_tick_fail when enforce throws', async () => {
    const logGuardEvent = (await import('@/lib/guards/service')).logGuardEvent as jest.Mock;
    enforceSoftwareCryptoStops.mockRejectedValueOnce(new Error('tick boom'));
    await runCryptoSoftwareStopsForPositions(
      [{ symbol: 'BTCUSD', current_price: '90000' } as never],
      { 'BTC/USD': [{ c: 89_000, v: 1 }] },
      ['BTC/USD'],
    );
    expect(logGuardEvent).toHaveBeenCalledWith(
      'crypto_software_stop_tick_fail',
      'Error: tick boom',
      expect.objectContaining({ symbol: 'BTCUSD' }),
    );
  });
});

describe('crypto-scan stop order (M-6 integration)', () => {
  beforeEach(() => {
    enforceSoftwareCryptoStops.mockClear();
    enforceSoftwareCryptoStops.mockResolvedValue({ triggered: false });
  });

  it('runs software stops before returning when the module is disabled', async () => {
    await import('./routines');
    const handler = registerRoutineHandler.mock.calls.find((c) => c[0] === 'crypto-scan')?.[1];
    expect(handler).toBeDefined();
    const result = await handler!();
    expect(enforceSoftwareCryptoStops).toHaveBeenCalled();
    expect(result).toMatchObject({ skipped: true, reason: expect.stringContaining('disabled') });
  });
});
