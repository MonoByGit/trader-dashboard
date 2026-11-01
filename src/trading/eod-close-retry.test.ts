import { retryAsync } from './eod-close-retry.js';

describe('retryAsync', () => {
  it('retries close attempts before succeeding', async () => {
    let n = 0;
    const out = await retryAsync(
      async () => {
        n += 1;
        if (n < 3) throw new Error('fail');
        return 'ok';
      },
      { attempts: 3, delayMs: 1 },
    );
    expect(out).toBe('ok');
    expect(n).toBe(3);
  });
});
