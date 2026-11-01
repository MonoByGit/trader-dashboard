export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { logAlpacaModeAtStartup } = await import('./lib/alpaca-startup');
    logAlpacaModeAtStartup();
  }
}
