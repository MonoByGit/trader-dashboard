import { safeNewsJsonFromText } from './news-json.js';

describe('safeNewsJsonFromText', () => {
  it('returns parsed object slice', () => {
    expect(safeNewsJsonFromText('prefix {"QQQ":"safe"} suffix')).toBe('{"QQQ":"safe"}');
  });

  it('falls back on truncation finish reason', () => {
    expect(safeNewsJsonFromText('{"QQQ":"safe', 'MAX_TOKENS')).toBe('{}');
  });

  it('falls back on broken JSON', () => {
    expect(safeNewsJsonFromText('{broken', 'STOP')).toBe('{}');
  });
});
