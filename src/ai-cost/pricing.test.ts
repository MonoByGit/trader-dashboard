import { estimateCostUsd, loadPriceTable, resetPriceTableCache } from './pricing.js';

describe('AI cost calculation', () => {
  beforeEach(() => resetPriceTableCache());

  it('uses configured model prices', () => {
    const table = loadPriceTable(JSON.stringify({
      'test-model': { inputPer1M: 1, outputPer1M: 2 },
    }));
    const cost = estimateCostUsd('test-model', 1_000_000, 500_000, table);
    expect(cost).toBeCloseTo(2);
  });

  it('computes gemini flash tier', () => {
    const table = loadPriceTable('{}');
    const cost = estimateCostUsd('gemini-2.5-flash', 10_000, 2_000, table);
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(0.05);
  });
});
