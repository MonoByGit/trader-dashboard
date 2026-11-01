import { runPerSymbolEnforcements } from './enforce-scan-resilience';

describe('crypto scan enforce resilience (M-5)', () => {
  it('continues other symbols when one enforcement rejects', async () => {
    const log: string[] = [];
    await runPerSymbolEnforcements(
      ['BTC/USD', 'ETH/USD'],
      async (symbol) => {
        if (symbol === 'BTC/USD') throw new Error('insufficient qty');
        log.push(symbol);
      },
      async (_symbol, err) => {
        log.push(`err:${String(err)}`);
      },
    );
    expect(log).toEqual(['err:Error: insufficient qty', 'ETH/USD']);
  });
});
