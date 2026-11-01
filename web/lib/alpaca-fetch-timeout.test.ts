import { jest } from '@jest/globals';

await jest.unstable_mockModule('./alpaca-bars', () => ({
  DEFAULT_DAILY_BAR_LOOKBACK_DAYS: 40,
  fetchCryptoBars: jest.fn(),
  fetchStockDailyBars: jest.fn(),
}));
await jest.unstable_mockModule('./alpaca-startup', () => ({ logAlpacaModeAtStartup: () => {} }));

describe('alpaca fetch timeout', () => {
  beforeEach(() => {
    process.env.ALPACA_API_KEY = 'k';
    process.env.ALPACA_SECRET_KEY = 's';
    process.env.ALPACA_TRADING_BASE_URL = 'https://paper-api.alpaca.markets';
  });

  it('passes AbortSignal.timeout on trading GET', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      expect(init?.signal).toBeDefined();
      return new Response(JSON.stringify({ id: 'acc' }), { status: 200 });
    });
    const { alpaca } = await import('./alpaca');
    await alpaca.account();
    fetchSpy.mockRestore();
  });

  it('surfaces abort as a clean error when fetch times out', async () => {
    jest.spyOn(AbortSignal, 'timeout').mockReturnValue(AbortSignal.abort());
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(
      Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }),
    );
    const { alpaca } = await import('./alpaca');
    await expect(alpaca.account()).rejects.toThrow(/aborted/);
    jest.restoreAllMocks();
  });
});
