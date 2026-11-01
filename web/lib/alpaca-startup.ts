import { alpacaPaperModeFromBaseUrl, alpacaTradingBaseUrl } from '../../src/alpaca/paper-host';

let logged = false;

/** Log Alpaca paper vs live once per server process (no keys or secrets). */
export function logAlpacaModeAtStartup(): void {
  if (logged) return;
  logged = true;
  const baseUrl = alpacaTradingBaseUrl();
  const { isPaper, logLine } = alpacaPaperModeFromBaseUrl(baseUrl);
  if (isPaper) {
    console.log(logLine);
  } else {
    console.warn(logLine);
  }
}
