export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.NEXT_PHASE !== 'phase-production-build') {
      const { assertProductionAuthEnv } = await import('../src/security/production-auth');
      assertProductionAuthEnv();
    }
    const { logAlpacaModeAtStartup } = await import('./lib/alpaca-startup');
    logAlpacaModeAtStartup();
  }
}
