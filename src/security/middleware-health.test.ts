describe('middleware health bypass (PR 33)', () => {
  it('orders M-8 503, then /api/health, then cron bypasses, before login', async () => {
    const src = await import('fs/promises').then((fs) =>
      fs.readFile(new URL('../../web/middleware.ts', import.meta.url), 'utf8'),
    );
    const m8 = src.indexOf('shouldBlockMisconfiguredProduction');
    const health = src.indexOf("pathname === '/api/health'");
    const cron = src.indexOf("pathname.startsWith('/api/cron')");
    const auth = src.indexOf('authEnabled()');
    expect(m8).toBeGreaterThan(-1);
    expect(health).toBeGreaterThan(-1);
    expect(cron).toBeGreaterThan(-1);
    expect(auth).toBeGreaterThan(-1);
    expect(m8).toBeLessThan(health);
    expect(health).toBeLessThan(cron);
    expect(cron).toBeLessThan(auth);
  });
});
