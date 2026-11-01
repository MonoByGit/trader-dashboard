export const ALPACA_PAPER_HOST = 'paper-api.alpaca.markets';

export function alpacaTradingBaseUrl(): string {
  return process.env.ALPACA_BASE_URL ?? `https://${ALPACA_PAPER_HOST}`;
}

export function alpacaTradingHost(baseUrl: string = alpacaTradingBaseUrl()): string {
  try {
    return new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function isAlpacaPaperHost(host: string): boolean {
  return host === ALPACA_PAPER_HOST;
}

export function alpacaPaperModeFromBaseUrl(baseUrl: string = alpacaTradingBaseUrl()): {
  host: string;
  isPaper: boolean;
  logLine: string;
} {
  const host = alpacaTradingHost(baseUrl);
  const isPaper = isAlpacaPaperHost(host);
  const logLine = isPaper
    ? `[alpaca] mode=paper host=${host}`
    : `[alpaca] mode=LIVE host=${host} — WARNING: not paper-api.alpaca.markets; order placement blocked`;
  return { host, isPaper, logLine };
}

export class AlpacaLiveTradingBlockedError extends Error {
  constructor(host: string) {
    super(
      `[alpaca] Refusing to place orders: trading host "${host}" is not paper (${ALPACA_PAPER_HOST}).`,
    );
    this.name = 'AlpacaLiveTradingBlockedError';
  }
}

export function assertAlpacaPaperTrading(baseUrl: string = alpacaTradingBaseUrl()): void {
  const { host, isPaper } = alpacaPaperModeFromBaseUrl(baseUrl);
  if (!isPaper) {
    console.error(
      `[alpaca] ORDER BLOCKED: host=${host} is not ${ALPACA_PAPER_HOST}. Set ALPACA_BASE_URL to paper or unset it.`,
    );
    throw new AlpacaLiveTradingBlockedError(host);
  }
}
