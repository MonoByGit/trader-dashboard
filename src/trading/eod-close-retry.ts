export async function retryAsync<T>(
  fn: () => Promise<T>,
  opts: { attempts: number; delayMs: number; backoff?: number },
): Promise<T> {
  let lastErr: unknown;
  let delay = opts.delayMs;
  for (let i = 0; i < opts.attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < opts.attempts - 1) {
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.round(delay * (opts.backoff ?? 1.5));
      }
    }
  }
  throw lastErr;
}
