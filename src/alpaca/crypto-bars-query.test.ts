import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cryptoBarsSymbolsQueryString } from './crypto-bars-query.js';

const repoRoot = join(fileURLToPath(import.meta.url), '../../..');

describe('crypto bars symbols query (web/lib/alpaca-bars uses this module)', () => {
  it('encodes BTC/USD once (not %252F)', () => {
    const qs = cryptoBarsSymbolsQueryString(['BTC/USD']);
    expect(qs).toContain('symbols=BTC%2FUSD');
    expect(qs).not.toContain('%252F');
  });

  it('joins multiple symbols with comma', () => {
    const qs = cryptoBarsSymbolsQueryString(['BTC/USD', 'ETH/USD']);
    expect(qs).toMatch(/symbols=BTC%2FUSD%2CETH%2FUSD/);
  });

  it('wires fetchCryptoBars and re-export through web/lib/alpaca-bars', () => {
    const bars = readFileSync(join(repoRoot, 'web/lib/alpaca-bars.ts'), 'utf8');
    expect(bars).toMatch(/from ['"].*crypto-bars-query/);
    expect(bars).toMatch(/setCryptoBarsSymbols\(url, opts\.symbols\)/);
    expect(bars).toMatch(/export \{ cryptoBarsSymbolsQueryString \}/);
  });
});
