import { toTradingDateString } from '../dates/trading-date';

describe('backtest calendar dates', () => {
  it('formats pg Date objects as YYYY-MM-DD for Alpaca', () => {
    const fromDb = new Date('2025-11-03T00:00:00.000Z');
    expect(toTradingDateString(fromDb)).toBe('2025-11-03');
  });

  it('does not pass JS Date.toString() through to Alpaca', () => {
    expect(() => toTradingDateString('Mon Nov 03 2025 00:00:00 GMT+0000 (Coordinated Universal Time)')).toThrow();
  });
});
