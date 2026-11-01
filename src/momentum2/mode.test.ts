import { readFileSync } from 'node:fs';
import { resolveMomentum2Mode, resolveShadowMode } from './mode';

describe('momentum2 modus', () => {
  it('staat standaard uit', () => {
    expect(resolveMomentum2Mode({})).toMatchObject({ run: false });
    expect(resolveMomentum2Mode({ MOMENTUM2_ENABLED: 'true' })).toMatchObject({ run: false });
  });
  it('aan = alleen schaduw', () => {
    expect(resolveMomentum2Mode({ MOMENTUM2_ENABLED: '1' })).toEqual({ run: true, shadow: true });
    expect(resolveMomentum2Mode({ MOMENTUM2_ENABLED: '1', MOMENTUM2_DRY_RUN: '1' })).toEqual({ run: true, shadow: true });
  });
  it('DRY_RUN=0 weigert te handelen, welke waarde ook', () => {
    const m = resolveMomentum2Mode({ MOMENTUM2_ENABLED: '1', MOMENTUM2_DRY_RUN: '0' });
    expect(m.run).toBe(false);
    for (const v of ['0', '1', 'false', 'no', '', undefined, 'real', 'live']) {
      const r = resolveMomentum2Mode({ MOMENTUM2_ENABLED: '1', MOMENTUM2_DRY_RUN: v });
      expect('shadow' in r ? r.shadow : true).toBe(true); // er bestaat geen niet-schaduw modus
    }
  });
  it('de route importeert de Alpaca-broker niet', () => {
    const src = readFileSync(new URL('../../web/lib/momentum2/run.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/alpacaPaperBroker/);
    expect(src).not.toMatch(/placeOrder|cancelOrder/);
    expect(src).toMatch(/resolveMomentum2Mode/);
  });
});

describe('resolveShadowMode (M4)', () => {
  it('uit tenzij ENABLED=1, en DRY_RUN=0 wordt geweigerd', () => {
    expect(resolveShadowMode({}, 'MOMENTUM4')).toMatchObject({ run: false });
    expect(resolveShadowMode({ MOMENTUM4_ENABLED: '1' }, 'MOMENTUM4')).toEqual({ run: true, shadow: true });
    expect(resolveShadowMode({ MOMENTUM4_ENABLED: '1', MOMENTUM4_DRY_RUN: '0' }, 'MOMENTUM4')).toMatchObject({ run: false });
  });
});

describe('M4-route', () => {
  it('raakt geen echte orders; 13F via SEC EDGAR', () => {
    const src = readFileSync(new URL('../../web/lib/momentum4/run.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/alpacaPaperBroker|placeOrder|cancelOrder/);
    expect(src).toMatch(/list13FFilings|fetch13FHoldings/);
    expect(src).toMatch(/shadowBroker/);
  });
});
