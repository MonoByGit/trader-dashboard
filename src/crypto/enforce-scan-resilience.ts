/** Per-position enforce loop: one failure must not abort the crypto scan. */
export async function runPerSymbolEnforcements(
  symbols: string[],
  enforce: (symbol: string) => Promise<void>,
  onError: (symbol: string, err: unknown) => Promise<void>,
): Promise<void> {
  for (const symbol of symbols) {
    try {
      await enforce(symbol);
    } catch (err) {
      await onError(symbol, err);
    }
  }
}
