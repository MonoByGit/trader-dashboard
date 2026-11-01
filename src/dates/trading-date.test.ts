import { toTradingDateString } from './trading-date';

describe('toTradingDateString', () => {
  it('accepts ISO date strings', () => {
    expect(toTradingDateString('2025-06-01')).toBe('2025-06-01');
    expect(toTradingDateString('2025-06-01T00:00:00.000Z')).toBe('2025-06-01');
  });

  it('accepts Date objects from pg', () => {
    expect(toTradingDateString(new Date('2025-11-03T00:00:00.000Z'))).toBe('2025-11-03');
  });

  it('rejects JS Date.toString() style strings', () => {
    expect(() => toTradingDateString('Mon Nov 03 2025 00:00:00 GMT+0000')).toThrow(/Ongeldige datum/);
  });
});
