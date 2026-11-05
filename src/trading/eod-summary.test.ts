import { eodExitsLabel, eodExitsToday } from './eod-summary.js';
import { tradingDateEt } from '../scheduler/decide.js';

const classify = (o: { symbol: string }) =>
  o.symbol === 'XLI' ? 'stop' : o.symbol === 'QQQ' ? 'take_profit' : null;

describe('eodExitsToday', () => {
  it('neemt de stop van XLI mee naast de EOD-sluiting van XLV (casus 4-11)', () => {
    const orders = [
      { symbol: 'XLI', side: 'sell', status: 'filled', filled_at: '2026-11-04T18:25:40Z', filled_avg_price: '167.47' },
      { symbol: 'XLV', side: 'buy', status: 'filled', filled_at: '2026-11-04T14:31:00Z', filled_avg_price: '187.47' },
    ];
    const exits = eodExitsToday(orders, [{ symbol: 'XLV', price: 188.1 }], '2026-11-04', tradingDateEt, classify);
    expect(exits).toEqual([
      { symbol: 'XLI', how: 'stop', price: 167.47 },
      { symbol: 'XLV', how: 'eod', price: 188.1 },
    ]);
    expect(eodExitsLabel(exits)).toBe('XLI (stop geraakt, $167.47), XLV (EOD-sluiting, $188.10)');
  });

  it('telt alleen fills van dezelfde ET-handelsdag', () => {
    // 01:30 UTC op 5-11 is nog 4-11 in New York; 3-11 valt erbuiten.
    const orders = [
      { symbol: 'QQQ', side: 'sell', status: 'filled', filled_at: '2026-11-05T01:30:00Z', filled_avg_price: '500' },
      { symbol: 'XLI', side: 'sell', status: 'filled', filled_at: '2026-11-03T19:00:00Z', filled_avg_price: '170' },
    ];
    const exits = eodExitsToday(orders, [], '2026-11-04', tradingDateEt, classify);
    expect(exits.map((e) => e.symbol)).toEqual(['QQQ']);
  });

  it('zegt niets als er niets gesloten is', () => {
    expect(eodExitsLabel([])).toBe('niets');
  });
});
