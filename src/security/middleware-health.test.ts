describe('middleware health bypass', () => {
  const origPassword = process.env.APP_PASSWORD;
  const origSha = process.env.APP_PASSWORD_SHA256;

  afterEach(() => {
    if (origPassword === undefined) delete process.env.APP_PASSWORD;
    else process.env.APP_PASSWORD = origPassword;
    if (origSha === undefined) delete process.env.APP_PASSWORD_SHA256;
    else process.env.APP_PASSWORD_SHA256 = origSha;
  });

  it('/api/health is listed as public before login in middleware source', async () => {
    const src = await import('fs/promises').then((fs) =>
      fs.readFile(new URL('../../web/middleware.ts', import.meta.url), 'utf8'),
    );
    expect(src).toMatch(/pathname === '\/api\/health'/);
    const healthLine = src.split('\n').findIndex((l) => l.includes("/api/health"));
    const authLine = src.split('\n').findIndex((l) => l.includes('authEnabled()'));
    expect(healthLine).toBeGreaterThan(-1);
    expect(authLine).toBeGreaterThan(-1);
    expect(healthLine).toBeLessThan(authLine);
  });
});
