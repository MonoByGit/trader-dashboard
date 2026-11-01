/** @jest-environment node */
// Dave repro PR 47: dedupe nieuwste wint, slotbar-check, bad-tick, cron-bearer, M1-eigendom.
import { dedupeOrderIntents } from '../../../../src/momentum2/simulate';
import { isDailyBarComplete } from '../../../../src/momentum2/daily-bar-complete';
import { barLowForStopCheck } from '../../../../src/momentum2/bad-tick';
import { verifyCronBearer } from '../../../../src/security/production-auth';
import { isForeignStrategyOrder, m1CloseQty } from '../../../../src/trading/strategy-tags';
import { foreignQtyFromRealBooks } from '../../../../src/momentum2/book-aggregate';

describe('PR47 follow-ups', () => {
  it('D1 dedupe: nieuwste plan wint, één order per symbool en kant', () => {
    const out = dedupeOrderIntents([
      { symbol: 'QLD', side: 'sell', qty: 5, reason: 'carry' },
      { symbol: 'QLD', side: 'buy', notionalUsd: 100, reason: 'carry' },
      { symbol: 'QLD', side: 'sell', qty: 10, reason: 'plan' },
    ]);
    expect(out.filter((o) => o.side === 'sell')).toEqual([{ symbol: 'QLD', side: 'sell', qty: 10, reason: 'plan' }]);
    expect(out).toHaveLength(2);
  });

  it('B1 slotbar: vandaag + markt open = niet af; vandaag + dicht = af; gisteren = af; marketOpen onbekend = niet af', () => {
    expect(isDailyBarComplete({ lastBarSessionDate: '2026-11-02', sessionToday: '2026-11-02', marketOpen: true })).toBe(false);
    expect(isDailyBarComplete({ lastBarSessionDate: '2026-11-02', sessionToday: '2026-11-02', marketOpen: false })).toBe(true);
    expect(isDailyBarComplete({ lastBarSessionDate: '2026-10-30', sessionToday: '2026-11-02', marketOpen: true })).toBe(true);
    expect(isDailyBarComplete({ lastBarSessionDate: '2026-11-02', sessionToday: '2026-11-02' })).toBe(false);
  });

  it('T1 bad-tick: low >15% onder open en close telt niet, echte daling wel', () => {
    expect(barLowForStopCheck({ o: 100, c: 99, l: 70 })).toBe(99);
    expect(barLowForStopCheck({ o: 100, c: 80, l: 79 })).toBe(79);
    expect(barLowForStopCheck({ o: 100, c: 99, l: 85 })).toBe(85);
  });

  it('A1 cron-bearer: geen secret in productie = dicht; fout/leeg = dicht; juist = open', () => {
    const env = process.env as Record<string, string | undefined>;
    const old = { s: env.CRON_SECRET, n: env.NODE_ENV };
    try {
      delete env.CRON_SECRET; env.NODE_ENV = 'production';
      expect(verifyCronBearer('Bearer ')).toBe(false);
      expect(verifyCronBearer(null)).toBe(false);
      env.CRON_SECRET = '   '; expect(verifyCronBearer('Bearer ')).toBe(false);
      env.CRON_SECRET = 'dave-test-only'; 
      expect(verifyCronBearer('Bearer dave-test-onl')).toBe(false);
      expect(verifyCronBearer('bearer dave-test-only')).toBe(false);
      expect(verifyCronBearer('Bearer dave-test-only')).toBe(true);
      delete env.CRON_SECRET; env.NODE_ENV = 'development';
      expect(verifyCronBearer(null)).toBe(true); // let op: buiten productie open zonder secret
    } finally { env.CRON_SECRET = old.s; env.NODE_ENV = old.n; if (old.s === undefined) delete env.CRON_SECRET; }
  });

  it('O1 M1: m5s-/m6s-/m5-/m6- orders zijn foreign; real M5-boek telt mee in m1CloseQty', () => {
    for (const id of ['m5s-m5-nasdaq-trend-QLD-3000', 'm6s-m6-btc-breakout-BTC/USD-1', 'm5-m5-nasdaq-trend-2026-11-02-QLD-b', 'm6-m6-btc-breakout-2026-11-02-BTC/USD-b']) {
      expect(isForeignStrategyOrder(id)).toBe(true);
    }
    expect(isForeignStrategyOrder('etf-eod-QLD-sell-restop')).toBe(false);
    const m5book = { real: true, positions: { QLD: { qty: 20 } } } as never;
    const shadow = { real: false, positions: { QLD: { qty: 99 } } } as never;
    const foreign = foreignQtyFromRealBooks([m5book, shadow], 'QLD');
    expect(foreign).toBe(20);
    expect(m1CloseQty(25, foreign)).toBe(5);
    expect(m1CloseQty(20, foreign)).toBe(0);
  });
});
