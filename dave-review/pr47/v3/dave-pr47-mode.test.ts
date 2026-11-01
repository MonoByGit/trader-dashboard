/** @jest-environment node */
// Dave repro PR 47: modusmatrix, M2/M3 blijven schaduw, paper-host, brokerForMode raakt Alpaca alleen in papier.
import { jest } from '@jest/globals';
import { resolveMomentumPaperMode, resolveShadowMode } from '../../../../src/momentum2/mode';
import { assertAlpacaPaperTrading } from '../../../../src/alpaca/paper-host';

const VALS: Array<string | undefined> = [undefined, '', '0', ' 0', '0 ', 'false', 'FALSE', '1', ' 1', 'true', 'yes', 'no'];

describe('PR47 modusmatrix', () => {
  it('MX1 papier alleen bij ENABLED exact "1" EN DRY_RUN exact "0" (144 combinaties, M5 en M6)', () => {
    const rows: string[] = [];
    for (const name of ['MOMENTUM5', 'MOMENTUM6']) {
      for (const en of VALS) for (const dr of VALS) {
        const env: Record<string, string | undefined> = {};
        if (en !== undefined) env[`${name}_ENABLED`] = en;
        if (dr !== undefined) env[`${name}_DRY_RUN`] = dr;
        const m = resolveMomentumPaperMode(env, name);
        const paper = m.run && !m.shadow;
        const expected = en === '1' && dr === '0';
        if (paper !== expected) rows.push(`${name} ENABLED=${JSON.stringify(en)} DRY_RUN=${JSON.stringify(dr)} -> ${JSON.stringify(m)}`);
        if (en !== '1') expect(m.run).toBe(false);
      }
    }
    expect(rows).toEqual([]);
  });

  it('MX2 globale DRY_RUN=0 of andere namen openen niets (alleen <NAME>_DRY_RUN telt)', () => {
    expect(resolveMomentumPaperMode({ MOMENTUM5_ENABLED: '1', DRY_RUN: '0' }, 'MOMENTUM5')).toEqual({ run: true, shadow: true });
    expect(resolveMomentumPaperMode({ MOMENTUM5_ENABLED: '1', MOMENTUM6_DRY_RUN: '0' }, 'MOMENTUM5')).toEqual({ run: true, shadow: true });
    expect(resolveMomentumPaperMode({ MOMENTUM6_ENABLED: '1', MOMENTUM5_DRY_RUN: '0' }, 'MOMENTUM6')).toEqual({ run: true, shadow: true });
  });

  it('MX3 M2/M3 (resolveShadowMode) weigeren DRY_RUN=0 nog steeds', () => {
    for (const name of ['MOMENTUM2', 'MOMENTUM3']) {
      const m = resolveShadowMode({ [`${name}_ENABLED`]: '1', [`${name}_DRY_RUN`]: '0' }, name);
      expect(m.run).toBe(false);
    }
  });

  it('MX4 paper-host: live host en rommel worden geweigerd, alleen paper-api.alpaca.markets mag', () => {
    expect(() => assertAlpacaPaperTrading('https://api.alpaca.markets')).toThrow();
    expect(() => assertAlpacaPaperTrading('https://paper-api.alpaca.markets.evil.io')).toThrow();
    expect(() => assertAlpacaPaperTrading('not a url')).toThrow();
    expect(() => assertAlpacaPaperTrading('https://PAPER-API.alpaca.markets/v2')).not.toThrow();
  });
});

describe('PR47 brokerForMode raakt Alpaca alleen in papier', () => {
  it('MX5 schaduw (alle niet-papier modi) doet geen enkele Alpaca-call; papier wel', async () => {
    jest.resetModules();
    const calls: string[] = [];
    const rec = (n: string) => jest.fn(async (..._a: unknown[]) => { calls.push(n); return [] as never; });
    jest.unstable_mockModule('@/lib/alpaca', () => ({
      alpaca: { placeOrder: rec('placeOrder'), cancelOrder: rec('cancelOrder'), openOrders: rec('openOrders'), orders: rec('orders'), getOrder: rec('getOrder') },
    }));
    const { brokerForMode } = await import('@/lib/momentum2/paper-run');
    const modes = [
      { run: false as const, reason: 'uit' },
      { run: true as const, shadow: true as const },
    ];
    for (const m of modes) {
      const b = brokerForMode(m as never, { QLD: 50 });
      await b.setStop({ versionId: 'v', symbol: 'QLD', qty: 1, stopPrice: 10, stopClientPrefix: 'm5s-v-' });
      await b.cancelStop({ versionId: 'v', symbol: 'QLD', stopClientPrefix: 'm5s-v-' });
      await b.marketOrder({ versionId: 'v', symbol: 'QLD', side: 'buy', qty: 1, clientOrderId: 'x' });
      await b.stopFill({ versionId: 'v', symbol: 'QLD', since: '2026-01-01', stopClientPrefix: 'm5s-v-' });
      await b.listOpenStops({ stopClientPrefix: 'm5s-v-' });
    }
    expect(calls).toEqual([]);
    const p = brokerForMode({ run: true, shadow: false, paper: true }, { QLD: 50 });
    await p.listOpenStops({ stopClientPrefix: 'm5s-v-' });
    expect(calls).toEqual(['openOrders']);
  });
});
