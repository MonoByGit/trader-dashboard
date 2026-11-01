import {
  ALPACA_PAPER_HOST,
  alpacaPaperModeFromBaseUrl,
  alpacaTradingHost,
  assertAlpacaPaperTrading,
  isAlpacaPaperHost,
  AlpacaLiveTradingBlockedError,
} from './paper-host';

describe('alpaca paper host', () => {
  it('recognizes the paper trading host', () => {
    expect(isAlpacaPaperHost(ALPACA_PAPER_HOST)).toBe(true);
    expect(alpacaTradingHost('https://paper-api.alpaca.markets/v2')).toBe(ALPACA_PAPER_HOST);
  });

  it('rejects live trading host', () => {
    expect(isAlpacaPaperHost('api.alpaca.markets')).toBe(false);
    const mode = alpacaPaperModeFromBaseUrl('https://api.alpaca.markets');
    expect(mode.isPaper).toBe(false);
    expect(mode.logLine).toContain('mode=LIVE');
    expect(mode.logLine).toContain('WARNING');
  });

  it('logs paper mode without secrets', () => {
    const mode = alpacaPaperModeFromBaseUrl('https://paper-api.alpaca.markets');
    expect(mode.logLine).toBe('[alpaca] mode=paper host=paper-api.alpaca.markets');
    expect(mode.logLine).not.toMatch(/key|secret|APCA/i);
  });

  it('blocks order paths when not on paper', () => {
    expect(() => assertAlpacaPaperTrading('https://api.alpaca.markets')).toThrow(
      AlpacaLiveTradingBlockedError,
    );
    expect(() => assertAlpacaPaperTrading('https://paper-api.alpaca.markets')).not.toThrow();
  });
});
